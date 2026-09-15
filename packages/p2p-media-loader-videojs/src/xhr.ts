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
  VhsResponse,
  VhsResponseHook,
  VhsXhr,
  VideoJsLike,
  VideoJsPlayerLike,
} from "./types.js";

type ByteRange = ReturnType<typeof byteRangeFromRangeHeader>;

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
 * The optional replacement for `videojs.Vhs.xhr`, which VHS calls for every
 * request of every player once `original` is not `true`. Bound players route
 * their requests through their own engine's hooks; all this replacement adds
 * is the one request those hooks cannot see — the first manifest of a source,
 * which VHS sends from inside its source handler before any hook can be
 * attached. Every other request goes straight on to `videojs.xhr`.
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
    options: VhsRequestOptions,
    callback: VhsCallback,
  ): VhsRequest {
    const router = registry.findBySrc(options.uri);
    if (!router) return videojs.xhr(options, callback);
    return router.loadUnhooked(options, callback);
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
 * One player's requests: a pair of VHS hooks on that player's own xhr
 * function, and the decisions they make. See specs/player-adapters.md,
 * "video.js".
 *
 * The request hook hands VHS a request object of its own for every segment
 * the core can serve; the response hook reads the bytes of every playlist,
 * MPD and `sidx` VHS fetches. Neither touches any other player.
 */
export class RequestRouter {
  private readonly logger = debug("p2pml-videojs:loader");
  private readonly hooked = new Set<VhsXhr>();
  private lastSrc?: string;
  private topLevelSrc?: string;

  constructor(
    private readonly core: Core,
    private readonly player: VideoJsPlayerLike,
    private readonly videojs: VideoJsLike,
  ) {}

  /**
   * Puts this player's hooks on the xhr function of its current VHS handler.
   *
   * @returns `true` when they were attached just now, which means the
   * requests VHS has already sent for this source never passed through them.
   */
  attachHooks(): boolean {
    const xhr = this.player.tech(true)?.vhs?.xhr;
    if (!xhr || this.hooked.has(xhr)) return false;
    if (xhr.onRequest) xhr.onRequest(this.handleRequest);
    else (xhr._requestCallbackSet ??= new Set()).add(this.handleRequest);
    if (xhr.onResponse) xhr.onResponse(this.handleResponse);
    else (xhr._responseCallbackSet ??= new Set()).add(this.handleResponse);
    this.hooked.add(xhr);
    return true;
  }

  detachHooks() {
    for (const xhr of this.hooked) {
      if (xhr.offRequest) xhr.offRequest(this.handleRequest);
      else xhr._requestCallbackSet?.delete(this.handleRequest);
      if (xhr.offResponse) xhr.offResponse(this.handleResponse);
      else xhr._responseCallbackSet?.delete(this.handleResponse);
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

  /**
   * Attaches the hooks and makes sure the core has the top-level manifest of
   * the player's current source. VHS requests that manifest from inside its
   * source handler, before an engine bound to the player can hook anything,
   * so unless the global `videojs.Vhs.xhr` replacement caught it the adapter
   * fetches it once itself.
   */
  ensureTopLevelManifest() {
    this.attachHooks();
    const src = this.player.currentSrc();
    if (!src || src === this.topLevelSrc) return;
    this.topLevelSrc = src;
    this.noteSource(src);
    this.logger("reading the manifest VHS fetched before binding: %s", src);

    this.videojs.xhr({ uri: src }, (error, response) => {
      if (error ?? !isOk(response.statusCode)) {
        // The core sees this source's next manifest refresh instead; a VOD
        // stream stays on HTTP.
        this.logger("could not read %s: %O", src, error);
        return;
      }
      this.process(() =>
        this.core.processManifest({
          url: urlOf(response.rawRequest, src),
          data: bodyOf(response),
        }),
      );
    });
  }

  /**
   * A request of this player's that reached the global `videojs.Vhs.xhr`
   * replacement without passing through this router's hooks. Only the first
   * manifest of a source can do that, and only once: the hooks go on here.
   */
  loadUnhooked(options: VhsRequestOptions, callback: VhsCallback): VhsRequest {
    if (!this.attachHooks()) return this.videojs.xhr(options, callback);

    const { uri } = options;
    this.topLevelSrc = uri;
    this.noteSource(this.player.currentSrc());
    return this.videojs.xhr(options, (error, response) => {
      if (!error && isOk(response.statusCode)) {
        this.process(() =>
          this.core.processManifest({
            url: urlOf(response.rawRequest, uri),
            data: bodyOf(response, response.rawRequest),
          }),
        );
      }
      callback(error, response);
    });
  }

  /**
   * Hands VHS a request object the core fills for every segment it holds.
   * `@videojs/xhr` drives whatever object it is given in `options.xhr`
   * instead of opening an `XMLHttpRequest`, so a served segment reaches VHS
   * through exactly the path an HTTP one does.
   */
  private readonly handleRequest: VhsRequestHook = (options) => {
    const { uri, requestType } = options;
    if (isManifest(requestType)) {
      if (uri === this.player.currentSrc()) this.topLevelSrc = uri;
      this.noteSource(this.player.currentSrc());
      return options;
    }
    if (requestType !== REQUEST_TYPE.SEGMENT) return options;

    const byteRange = byteRangeOf(options.headers);
    if (!this.core.isSegmentLoadable(uri, byteRange)) return options;
    return { ...options, xhr: new ServedRequest(this.core, uri, byteRange) };
  };

  /** Reads the bytes of everything VHS fetches that the core parses. */
  private readonly handleResponse: VhsResponseHook = (
    request,
    error,
    response,
  ) => {
    if (error ?? !isOk(response.statusCode)) return;
    // A segment the core served carries nothing the core has to read back.
    if (request instanceof ServedRequest) return;

    const uri = request.uri ?? "";
    if (isManifest(request.requestType)) {
      this.process(() =>
        this.core.processManifest({
          url: urlOf(request, uri),
          data: bodyOf(response, request),
        }),
      );
      return;
    }

    const data = request.response;
    if (!isBinary(data)) return;
    const byteRange = byteRangeOf(request.headers);
    if (
      request.requestType === REQUEST_TYPE.DASH_SIDX ||
      this.core.isSegmentIndex(uri, byteRange)
    ) {
      this.process(() =>
        this.core.processSegmentIndex({ url: uri, byteRange, data }),
      );
    }
  };

  /** A change of source starts a new stream context; a refresh does not. */
  private noteSource(src: string) {
    if (src === this.lastSrc) return;
    if (this.lastSrc !== undefined) this.core.destroy();
    this.lastSrc = src;
  }

  /** Nothing the core does with what it is handed may break playback. */
  private process(work: () => void) {
    try {
      work();
    } catch (failure) {
      this.logger("the core failed to process a response: %O", failure);
    }
  }
}

/**
 * A segment the core serves, shaped as the `XMLHttpRequest` that
 * `@videojs/xhr` drives and VHS reads: the library opens and sends it, and
 * on completion reads the status and the response off it, exactly as it
 * would from a request the browser made.
 */
class ServedRequest implements VhsRequest {
  /** Set by `@videojs/xhr`; VHS's callback wrapper reads it back. */
  responseType = "";
  withCredentials = false;
  readyState = 0;
  status = 0;
  statusText = "";
  response?: ArrayBuffer;
  responseURL = "";
  aborted = false;
  /**
   * Bits per second. VHS measures bandwidth from the wall clock unless the
   * request carries one already, and the clock says nothing about the
   * network when a segment came from a peer or from storage.
   */
  bandwidth?: number;

  onload: (() => void) | null = null;
  onerror: ((error: Error) => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: ((error: Error) => void) | null = null;
  onprogress: (() => void) | null = null;
  onreadystatechange: (() => void) | null = null;

  private sent = false;
  /**
   * VHS's own wrapper sets `aborted` on the request before calling `abort`,
   * so the flag cannot double as the record of what this object has done.
   */
  private cancelled = false;

  constructor(
    private readonly core: Core,
    private readonly url: string,
    private readonly byteRange: ByteRange,
  ) {}

  open() {
    this.readyState = 1;
  }

  setRequestHeader() {
    // The range is already part of the segment's identity in the core.
  }

  overrideMimeType() {
    // The core hands over bytes; there is no mime type to correct.
  }

  getAllResponseHeaders() {
    return "";
  }

  getResponseHeader() {
    return null;
  }

  send() {
    if (this.sent) return;
    this.sent = true;
    this.core
      .loadSegment(this.url, { byteRange: this.byteRange })
      .then(({ data, bandwidth }) => {
        if (this.cancelled) return;
        this.response = data;
        this.responseURL = this.url;
        this.status = 200;
        this.readyState = 4;
        if (bandwidth > 0) this.bandwidth = Math.round(bandwidth);
        this.onload?.();
      })
      .catch((error: unknown) => {
        if (this.cancelled) return;
        this.readyState = 4;
        this.onerror?.(
          error instanceof CoreRequestError || error instanceof Error
            ? error
            : new Error(String(error)),
        );
      });
  }

  /**
   * VHS aborts a segment when it gives up on it or tears the loader down,
   * and `@videojs/xhr` aborts one that outran its timeout. Like an aborted
   * `XMLHttpRequest`, this one then completes for nobody.
   */
  abort() {
    if (this.cancelled) return;
    this.cancelled = true;
    this.aborted = true;
    this.core.abortSegmentLoading(this.url, this.byteRange);
    this.onabort?.();
  }

  // VHS watches segment requests for progress to abandon slow ones early; a
  // served segment arrives whole, so there is nothing to report.
  addEventListener() {
    /* no progress events for a served segment */
  }

  removeEventListener() {
    /* nothing was registered */
  }
}

function isManifest(requestType: string | undefined): boolean {
  return (
    requestType === REQUEST_TYPE.HLS_PLAYLIST ||
    requestType === REQUEST_TYPE.DASH_MANIFEST
  );
}

function isOk(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

function byteRangeOf(
  headers: Record<string, string | undefined> | undefined,
): ByteRange {
  return byteRangeFromRangeHeader(headers?.Range ?? headers?.range);
}

/** The URL the response came from, which follows redirects. */
function urlOf(request: VhsRequest | undefined, uri: string): string {
  const responseURL = request?.responseURL;
  return responseURL !== undefined && responseURL !== "" ? responseURL : uri;
}

/** What a manifest response holds, as text or as the bytes VHS received. */
function bodyOf(
  response: VhsResponse,
  request?: VhsRequest,
): string | ArrayBuffer | ArrayBufferView {
  const fromRequest =
    request?.responseType === "arraybuffer"
      ? request.response
      : request?.responseText;
  const data = fromRequest ?? response.body;
  if (typeof data === "string" || isBinary(data)) return data;
  return "";
}

function isBinary(data: unknown): data is ArrayBuffer | ArrayBufferView {
  return data instanceof ArrayBuffer || ArrayBuffer.isView(data);
}
