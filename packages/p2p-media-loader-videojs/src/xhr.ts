import {
  Core,
  CoreRequestError,
  byteRangeFromRangeHeader,
  debug,
} from "p2p-media-loader-core";
import {
  REQUEST_TYPE,
  VhsCallback,
  VhsRequest,
  VhsRequestHook,
  VhsRequestOptions,
  VhsXhr,
  VideoJsLike,
  VideoJsPlayerLike,
} from "./types.js";

type TaggedOptions = VhsRequestOptions & { p2pml?: RequestRouter };

/** The routers of every bound engine on the page, for the one global hook. */
export class RouterRegistry {
  private readonly routers = new Set<RequestRouter>();

  add(router: RequestRouter) {
    this.routers.add(router);
  }

  remove(router: RequestRouter) {
    this.routers.delete(router);
  }

  /** The router whose player is loading exactly this URL, if any. */
  findBySrc(uri: string): RequestRouter | undefined {
    for (const router of this.routers) {
      if (router.matchesSrc(uri)) return router;
    }
    return undefined;
  }
}

/**
 * The replacement for `videojs.Vhs.xhr`. VHS calls it for every request of
 * every player once `original` is not `true`. A request tagged by a bound
 * player's hook goes to that player's engine; an untagged one is matched to a
 * player by its source URL — the first manifest request fires before any hook
 * can be attached — and everything else goes to `videojs.xhr` untouched.
 *
 * VHS reads its hook registry (`onRequest`, `_requestCallbackSet`, …) off
 * `videojs.Vhs.xhr`, so the replacement carries the original's over.
 */
export function createVhsXhr(
  videojs: VideoJsLike,
  registry: RouterRegistry,
  original: VhsXhr,
): VhsXhr {
  const replacement = function vhsXhrWithP2P(
    options: TaggedOptions,
    callback: VhsCallback,
  ): VhsRequest {
    let router = options.p2pml;
    if (!router) {
      router = registry.findBySrc(options.uri);
      // Late for this request; in place for every following one.
      router?.attachHook();
    }
    if (!router) return videojs.xhr(options, callback);
    return router.load(options, callback);
  } as VhsXhr;

  for (const key of [
    "beforeRequest",
    "_requestCallbackSet",
    "_responseCallbackSet",
    "onRequest",
    "offRequest",
    "onResponse",
    "offResponse",
  ] as const) {
    const value: unknown = Reflect.get(original, key);
    if (value !== undefined) {
      Object.assign(replacement, { [key]: value });
    }
  }
  return replacement;
}

/**
 * One player's requests. Tags them so the global hook can attribute them,
 * and decides for each what the core does with it. See
 * specs/player-adapters.md, "video.js".
 */
export class RequestRouter {
  private readonly logger = debug("p2pml-videojs:loader");
  private readonly hooked = new Set<VhsXhr>();
  private lastSrc?: string;

  constructor(
    private readonly core: Core,
    private readonly player: VideoJsPlayerLike,
    private readonly videojs: VideoJsLike,
  ) {}

  private readonly tag: VhsRequestHook = (options) =>
    ({ ...options, p2pml: this }) as TaggedOptions;

  /** Registers the tagging hook on the player's current VHS xhr, once. */
  attachHook() {
    const xhr = this.player.tech(true).vhs?.xhr;
    if (!xhr || this.hooked.has(xhr)) return;
    if (xhr.onRequest) {
      xhr.onRequest(this.tag);
    } else {
      (xhr._requestCallbackSet ??= new Set()).add(this.tag);
    }
    this.hooked.add(xhr);
  }

  detachHooks() {
    for (const xhr of this.hooked) {
      if (xhr.offRequest) xhr.offRequest(this.tag);
      else xhr._requestCallbackSet?.delete(this.tag);
    }
    this.hooked.clear();
  }

  matchesSrc(uri: string): boolean {
    try {
      return this.player.currentSrc() === uri;
    } catch {
      return false;
    }
  }

  load(options: VhsRequestOptions, callback: VhsCallback): VhsRequest {
    const { uri, requestType } = options;
    const byteRange = byteRangeFromRangeHeader(
      options.headers?.Range ?? options.headers?.range,
    );

    if (
      requestType === REQUEST_TYPE.HLS_PLAYLIST ||
      requestType === REQUEST_TYPE.DASH_MANIFEST
    ) {
      // A new source starts a new stream context; an MPD refresh or a media
      // playlist refresh keeps the current one.
      const src = this.player.currentSrc();
      if (src !== this.lastSrc) {
        if (this.lastSrc !== undefined) this.core.destroy();
        this.lastSrc = src;
      }
      return this.passThrough(options, callback, (request) => {
        const data =
          request.responseType === "arraybuffer"
            ? request.response
            : request.responseText;
        if (typeof data !== "string" && !isBinary(data)) return;
        // The response URL follows redirects when the browser filled it in.
        const { responseURL } = request;
        this.core.processManifest({
          url:
            responseURL !== undefined && responseURL !== "" ? responseURL : uri,
          data,
        });
      });
    }

    if (
      requestType === REQUEST_TYPE.DASH_SIDX ||
      (options.responseType === "arraybuffer" &&
        this.core.isSegmentIndex(uri, byteRange))
    ) {
      return this.passThrough(options, callback, (request) => {
        if (!isBinary(request.response)) return;
        this.core.processSegmentIndex({
          url: uri,
          byteRange,
          data: request.response,
        });
      });
    }

    if (
      requestType === REQUEST_TYPE.SEGMENT &&
      this.core.isSegmentLoadable(uri, byteRange)
    ) {
      return this.serve(options, byteRange, callback);
    }

    // Initialization segments, keys, steering, clock sync: untouched.
    return this.videojs.xhr(options, callback);
  }

  private passThrough(
    options: VhsRequestOptions,
    callback: VhsCallback,
    observe: (request: VhsRequest) => void,
  ): VhsRequest {
    const request = this.videojs.xhr(options, (error, response) => {
      if (!error && response.statusCode >= 200 && response.statusCode < 300) {
        try {
          observe(request);
        } catch (failure) {
          this.logger("failed to process %s: %O", options.uri, failure);
        }
      }
      callback(error, response);
    });
    return request;
  }

  private serve(
    options: VhsRequestOptions,
    byteRange: ReturnType<typeof byteRangeFromRangeHeader>,
    callback: VhsCallback,
  ): VhsRequest {
    const { uri } = options;
    const request = new ServedRequest(options, () => {
      this.core.abortSegmentLoading(uri, byteRange);
      finish(new Error(`request aborted: ${uri}`), 0);
    });
    let done = false;
    const finish = (error: Error | null, statusCode: number) => {
      if (done) return;
      done = true;
      request.status = statusCode;
      callback(error, { statusCode, headers: {} });
    };

    this.core
      .loadSegment(uri, { byteRange })
      .then(({ data, bandwidth }) => {
        request.response = data;
        request.responseURL = uri;
        // VHS measures bandwidth from wall-clock time unless the request
        // already carries one; a segment from a peer or from storage says
        // nothing about the network, so the core's estimate goes in instead.
        if (bandwidth > 0) request.bandwidth = Math.round(bandwidth);
        finish(null, 200);
      })
      .catch((error: unknown) => {
        if (error instanceof CoreRequestError && error.type === "aborted") {
          request.aborted = true;
        } else {
          this.logger("core failed to load %s: %O", uri, error);
        }
        finish(error instanceof Error ? error : new Error(String(error)), 0);
      });

    return request;
  }
}

/** The request object VHS gets back for a segment the core serves. */
class ServedRequest implements VhsRequest {
  readonly uri: string;
  readonly requestType?: string;
  readonly requestTime = Date.now();
  readonly responseType = "arraybuffer";
  response?: ArrayBuffer;
  responseURL?: string;
  status?: number;
  aborted = false;
  bandwidth?: number;

  constructor(
    options: VhsRequestOptions,
    private readonly onAbort: () => void,
  ) {
    this.uri = options.uri;
    this.requestType = options.requestType;
  }

  abort() {
    if (this.aborted) return;
    this.aborted = true;
    this.onAbort();
  }

  // VHS listens for progress on segment requests to abort slow ones early;
  // a served segment arrives whole, so there is nothing to report.
  addEventListener() {
    /* no progress events for a served segment */
  }
  removeEventListener() {
    /* nothing was registered */
  }
}

function isBinary(data: unknown): data is ArrayBuffer | ArrayBufferView {
  return data instanceof ArrayBuffer || ArrayBuffer.isView(data);
}
