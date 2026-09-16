import {
  Core,
  CoreRequestError,
  ProcessedManifest,
  byteRangeFromRangeHeader,
  debug,
} from "p2p-media-loader-core";
import {
  CommonMediaRequestLike,
  CommonMediaResponseLike,
  FactoryMakerThis,
  REQUEST_TYPE,
  XhrLoaderLike,
} from "./types.js";

export type LoaderHooks = {
  /** Called with what the core read from each MPD, before dash.js parses it. */
  onManifestProcessed?: (manifest: ProcessedManifest) => void;
};

const SEGMENT_TYPES: ReadonlySet<string> = new Set([
  REQUEST_TYPE.INIT_SEGMENT,
  REQUEST_TYPE.MEDIA_SEGMENT,
  REQUEST_TYPE.INDEX_SEGMENT,
]);

/**
 * The `XHRLoader` replacement, in the shape dash.js's `FactoryMaker` applies
 * it: a plain function it calls with `this.parent` set to the real loader,
 * whose `load` and `abort` the returned object overrides. Registered per
 * player through `player.extend("XHRLoader", extension, true)`.
 *
 * Every request dash.js makes over HTTP passes through here — MPD, init,
 * media and index segments, licences — and is told apart by the type of the
 * `FragmentRequest` behind it. See specs/player-adapters.md, "dash.js".
 */
export function createXhrLoaderExtension(core: Core, hooks: LoaderHooks = {}) {
  return function xhrLoaderExtension(this: FactoryMakerThis): XhrLoaderLike {
    // FactoryMaker copies the returned `load` and `abort` onto the parent
    // instance itself, so `this.parent.load` would point back here once the
    // override is applied. Keep dash.js's own methods before that happens.
    const { parent } = this;
    const original: XhrLoaderLike = {
      load: parent.load.bind(parent),
      abort: parent.abort.bind(parent),
    };
    const router = new RequestRouter(core, original, hooks);
    return {
      load: (request, response) => router.load(request, response),
      abort: () => router.abort(),
    };
  };
}

class RequestRouter {
  private readonly logger = debug("p2pml-dashjs:loader");
  /** Aborts the request served by the core most recently, if still in flight. */
  private abortCurrent?: () => void;

  constructor(
    private readonly core: Core,
    private readonly parent: XhrLoaderLike,
    private readonly hooks: LoaderHooks,
  ) {}

  load(
    request: CommonMediaRequestLike,
    response: CommonMediaResponseLike,
  ): boolean {
    const type = request.customData?.request?.type ?? undefined;
    const { url } = request;
    const byteRange = byteRangeFromRangeHeader(
      request.headers?.Range ?? request.headers?.range,
    );

    // Every MPD dash.js fetches — first load and each refresh — reaches the
    // core before dash.js parses the same bytes.
    if (type === REQUEST_TYPE.MPD) {
      return this.passThroughAndObserve(request, response, (data) => {
        if (typeof data !== "string" && !isBinary(data)) return;
        // The response URL, when the loader filled it in, follows redirects.
        const responseUrl = response.url;
        const processed = this.core.processManifest({
          url:
            responseUrl !== undefined && responseUrl !== "" ? responseUrl : url,
          data,
        });
        if (processed) this.hooks.onManifestProcessed?.(processed);
      });
    }

    if (type !== undefined && SEGMENT_TYPES.has(type)) {
      // A SegmentBase stream's index: dash.js loads it, the core reads the
      // segment list from the same bytes. Recognition, not lookup.
      if (this.core.isSegmentIndex(url, byteRange)) {
        return this.passThroughAndObserve(request, response, (data) => {
          if (!isBinary(data)) return;
          this.core.processSegmentIndex({ url, byteRange, data });
        });
      }

      // Whitelist by lookup: a segment the registry knows on a stream with
      // P2P enabled is served by the core; initialization segments and
      // anything the registry does not know load through dash.js itself.
      if (
        type === REQUEST_TYPE.MEDIA_SEGMENT &&
        this.core.isSegmentLoadable(url, byteRange)
      ) {
        this.serve(request, response, byteRange);
        return true;
      }
    }

    // Licences, certificates, steering, XLink, init segments: untouched.
    return this.parent.load(request, response);
  }

  abort() {
    this.abortCurrent?.();
    this.parent.abort();
  }

  private passThroughAndObserve(
    request: CommonMediaRequestLike,
    response: CommonMediaResponseLike,
    observe: (data: unknown) => void,
  ): boolean {
    request.customData ??= {};
    const { customData } = request;
    const original = customData.onloadend;
    // dash.js's XHRLoader copies `onloadend` onto the XHR at `load`, so the
    // wrap has to be in place before the parent runs.
    customData.onloadend = () => {
      try {
        if (response.status >= 200 && response.status <= 299) {
          observe(response.data);
        }
      } catch (error) {
        this.logger("failed to process %s: %O", request.url, error);
      }
      original?.();
    };
    return this.parent.load(request, response);
  }

  private serve(
    request: CommonMediaRequestLike,
    response: CommonMediaResponseLike,
    byteRange: ReturnType<typeof byteRangeFromRangeHeader>,
  ) {
    const { url } = request;
    request.customData ??= {};
    const { customData } = request;
    let settled = false;
    let aborted = false;

    const abort = () => {
      if (settled) return;
      aborted = true;
      this.core.abortSegmentLoading(url, byteRange);
    };
    customData.abort = abort;
    this.abortCurrent = abort;

    this.core
      .loadSegment(url, { byteRange })
      .then(({ data, bandwidth }) => {
        // The core cannot always cancel in time — a request waiting for the
        // segment storage has no loader yet — so what dash.js has abandoned
        // is dropped here rather than reported as a download.
        if (aborted) {
          settled = true;
          customData.onabort?.();
          return;
        }
        settled = true;
        response.url = url;
        response.status = 200;
        response.statusText = "OK";
        response.headers = {};
        response.data = data;

        // dash.js measures throughput from progress traces, dropping the
        // first (it carries the latency) and summing the rest. Two events
        // give it one download trace whose duration is the core's bandwidth
        // hint — wall-clock time says nothing about the network for a segment
        // that came from a peer or from storage. Never 0 ms.
        const total = data.byteLength;
        customData.onprogress?.({
          lengthComputable: true,
          loaded: 0,
          total,
          time: 1,
        });
        customData.onprogress?.({
          lengthComputable: true,
          loaded: total,
          total,
          time: loadingTimeMs(bandwidth, total),
        });
        customData.onloadend?.();
      })
      .catch((error: unknown) => {
        settled = true;
        if (error instanceof CoreRequestError && error.type === "aborted") {
          customData.onabort?.();
          return;
        }
        // A non-2xx status is what dash.js's HTTPLoader retries on; the
        // failure is reported as one rather than thrown into dash.js.
        response.url = url;
        response.status = 0;
        response.statusText =
          error instanceof Error ? error.message : String(error);
        response.data = undefined;
        this.logger("core failed to load %s: %O", url, error);
        customData.onloadend?.();
      });
  }
}

function isBinary(data: unknown): data is ArrayBuffer | ArrayBufferView {
  return data instanceof ArrayBuffer || ArrayBuffer.isView(data);
}

/** Download time in ms for the core's bandwidth hint; see the Shaka adapter. */
function loadingTimeMs(bandwidth: number, bytes: number): number {
  if (bandwidth <= 0) return 1;
  return Math.max(1, Math.round((bytes * 8 * 1000) / bandwidth));
}
