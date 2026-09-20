import {
  Core,
  ProcessedManifest,
  byteRangeFromRangeHeader,
  debug,
} from "p2p-media-loader-core";
import { stripPatchLocation } from "p2p-media-loader-core/dash";
import {
  CommonMediaRequestLike,
  CommonMediaResponseLike,
  FactoryMakerThis,
  REQUEST_TYPE,
  XhrLoaderLike,
} from "./types.js";

/**
 * The engine a player's requests belong to, looked up per request rather than
 * captured: dash.js keeps an extension for the life of the player and offers
 * no way to remove or replace one, so the extension the first engine installs
 * is the one every later engine has to be served by. No binding — the engine
 * was destroyed, or bound to another player — means every request passes
 * through to dash.js's own loader.
 */
export type LoaderBinding = {
  core: Core;
  /** Called with what the core read from each MPD, before dash.js parses it. */
  onManifestProcessed?: (manifest: ProcessedManifest) => void;
  /**
   * Called when another engine takes this player on, so the one that had it
   * gives back what it wrote to the player before the new one reads it.
   */
  release?: () => void;
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
export function createXhrLoaderExtension(
  binding: () => LoaderBinding | undefined,
) {
  return function xhrLoaderExtension(this: FactoryMakerThis): XhrLoaderLike {
    // FactoryMaker copies the returned `load` and `abort` onto the parent
    // instance itself, so `this.parent.load` would point back here once the
    // override is applied. Keep dash.js's own methods before that happens.
    const { parent } = this;
    const original: XhrLoaderLike = {
      load: parent.load.bind(parent),
      abort: parent.abort.bind(parent),
    };
    const router = new RequestRouter(binding, original);
    return {
      load: (request, response) => router.load(request, response),
      abort: () => router.abort(),
    };
  };
}

/**
 * One per dash.js XHRLoader, which dash.js builds once per media type and
 * keeps for the life of the player. Exported for its tests; the package's own
 * surface is the extension above.
 */
export class RequestRouter {
  private readonly logger = debug("p2pml-dashjs:loader");
  /** Aborts the request served by the core most recently, if still in flight. */
  private abortCurrent?: () => void;

  constructor(
    private readonly binding: () => LoaderBinding | undefined,
    private readonly parent: XhrLoaderLike,
  ) {}

  load(
    request: CommonMediaRequestLike,
    response: CommonMediaResponseLike,
  ): boolean {
    // Nothing reaches a core no engine is driving this player with: an engine
    // that was destroyed would otherwise have its core rebuilt by the next MPD
    // refresh, resuming P2P the integrator had stopped.
    const binding = this.binding();
    if (!binding) return this.parent.load(request, response);
    const { core } = binding;

    const type = request.customData?.request?.type ?? undefined;
    const { url } = request;
    const byteRange = byteRangeFromRangeHeader(
      request.headers?.Range ?? request.headers?.range,
    );

    // Every MPD dash.js fetches — first load and each refresh — reaches the
    // core before dash.js parses the same bytes.
    if (type === REQUEST_TYPE.MPD) {
      return this.passThroughAndObserve(binding, request, response, (data) => {
        if (typeof data !== "string" && !isBinary(data)) return;
        // Take `PatchLocation` out before dash.js reads the same bytes: a
        // player following it refreshes by patch, which the core cannot read,
        // and its registry would freeze at this window. The wrap runs ahead
        // of dash.js's own handler, so what it parses is what is left here.
        // See specs/player-adapters.md.
        const manifest =
          typeof data === "string" ? stripPatchLocation(data) : data;
        if (manifest !== data) {
          response.data = manifest;
          this.logger("removed PatchLocation from %s", url);
        }
        // The response URL, when the loader filled it in, follows redirects.
        const responseUrl = response.url;
        const processed = core.processManifest({
          url:
            responseUrl !== undefined && responseUrl !== "" ? responseUrl : url,
          requestedUrl: url,
          data: manifest,
        });
        if (processed) binding.onManifestProcessed?.(processed);
      });
    }

    if (type !== undefined && SEGMENT_TYPES.has(type)) {
      // A SegmentBase stream's index: dash.js loads it, the core reads the
      // segment list from the same bytes. Recognition, not lookup.
      if (core.isSegmentIndex(url, byteRange)) {
        return this.passThroughAndObserve(
          binding,
          request,
          response,
          (data) => {
            if (!isBinary(data)) return;
            // The window a `SegmentBase` presentation has is known only once
            // its index is read, so what the index says goes the same way a
            // manifest's does: it is the first thing that can place a live
            // player of one.
            const processed = core.processSegmentIndex({
              url,
              byteRange,
              data,
            });
            if (processed) binding.onManifestProcessed?.(processed);
          },
        );
      }

      // Whitelist by lookup: a segment the registry knows on a stream with
      // P2P enabled is served by the core; initialization segments and
      // anything the registry does not know load through dash.js itself.
      if (
        type === REQUEST_TYPE.MEDIA_SEGMENT &&
        core.isSegmentLoadable(url, byteRange)
      ) {
        this.serve(core, request, response, byteRange);
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
    binding: LoaderBinding,
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
        // The same binding, not merely some binding: what this observes was
        // made against that engine's core, and a response landing after that
        // engine let the player go would otherwise rebuild the core it
        // released — even where another engine has since taken the player on.
        if (
          this.binding() === binding &&
          response.status >= 200 &&
          response.status <= 299
        ) {
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
    core: Core,
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
      core.abortSegmentLoading(url, byteRange);
    };
    customData.abort = abort;
    this.abortCurrent = abort;
    // Once the request has settled there is nothing left to abort — and this
    // closure holds the scope the response lives in, so a `RequestRouter`
    // that kept it would keep the last segment's bytes for the life of the
    // player, one segment per media type. dash.js builds one XHRLoader per
    // media type and keeps it.
    const settle = () => {
      settled = true;
      if (this.abortCurrent === abort) this.abortCurrent = undefined;
    };

    // The two outcomes are handled by separate arguments to `then`, not by a
    // `catch` chained after it: delivering a segment runs dash.js's own
    // progress and loadend listeners synchronously, and its event bus catches
    // nothing, so a listener that throws would otherwise land in the failure
    // handler and be reported as the core failing to load a segment dash.js
    // has already consumed — which dash.js then fetches again itself.
    core
      .loadSegment(url, { byteRange })
      .then(
        ({ data, bandwidth }) => {
          // The core cannot always cancel in time — a request waiting for the
          // segment storage has no loader yet — so what dash.js has abandoned
          // is dropped here rather than reported as a download.
          settle();
          if (aborted) {
            customData.onabort?.();
            return;
          }
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
          // Delivered in a `try`, ended in a `finally`. `onprogress` runs
          // dash.js's LOADING_PROGRESS listeners synchronously — its event bus
          // catches nothing, and its own ABR abandonment handler is one of
          // them — so a listener that throws would otherwise skip `onloadend`,
          // and `onloadend` is what takes this request off dash.js's list: a
          // request never ended has no watchdog, the fragment promise never
          // settles, and that media type's buffer never advances again. The
          // segment stands as delivered; the throw is theirs, and is logged
          // by the handler below.
          try {
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
          } finally {
            customData.onloadend?.();
          }
        },
        (error: unknown) => {
          settle();
          // What dash.js abandoned is reported as the abort it asked for: it
          // drops `onloadend` when it aborts and keeps `onabort`, so a failure
          // reported here instead would tell it nothing and leave the segment
          // waiting for the next schedule tick to be asked for again.
          //
          // An abort dash.js did not ask for is not one — the core gives up on
          // a request superseded by the next one, or when the engine lets the
          // player go — and is reported below as the failure it is, so dash.js
          // fetches the segment itself.
          if (aborted) {
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
        },
      )
      // Reached only by a throw out of one of the handlers above: a dash.js
      // or integrator listener failing inside the terminal callback it was
      // given — `onloadend` or `onabort`, on delivery or on failure alike.
      // That callback was called exactly once and is not called again; what
      // dash.js does inside it once a listener of its own has thrown is
      // dash.js's to survive, and cannot be repaired from outside it. The
      // throw is logged rather than lost to an unhandled rejection.
      .catch((error: unknown) => {
        this.logger(
          "dash.js threw while the result for %s was reported to it: %O",
          url,
          error,
        );
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
