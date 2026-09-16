import {
  Core,
  CoreRequestError,
  byteRangeFromRangeHeader,
  debug,
} from "p2p-media-loader-core";
import {
  REQUEST_TYPE,
  VhsRequest,
  VhsRequestHook,
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
 * The hooks VHS runs for a player that has none of its own.
 *
 * Every source's first request is such a request: VHS creates the player's
 * own hook registry and sends the manifest request from inside its source
 * handler, so nothing can be put in front of it. VHS falls back to the
 * page-wide hooks for exactly that window, which is where these come in: they
 * hand the manifest to the engine bound to the player and put that player's
 * own hooks in place for everything after it.
 *
 * Reading the manifest VHS itself fetched, rather than fetching it again, is
 * what keeps the core and the player on one set of media playlist URLs — a
 * CDN that signs them per response, as Amazon IVS does, hands out a different
 * set to every request.
 */
export class FirstManifestHooks {
  private xhr?: VhsXhr;
  private engines = 0;

  constructor(private readonly registry: RouterRegistry) {}

  /**
   * Installs the hooks, once, for as long as an engine is bound.
   *
   * @returns `false` when this video.js has no hook registry to install them
   * on, and the engine has to read the manifest itself instead.
   */
  retain(videojs: VideoJsLike): boolean {
    const { xhr } = videojs.Vhs;
    if (this.xhr === xhr) {
      this.engines += 1;
      return true;
    }
    if (!xhr.onRequest || !xhr.onResponse) return false;
    xhr.onRequest(this.handleRequest);
    xhr.onResponse(this.handleResponse);
    this.xhr = xhr;
    this.engines += 1;
    return true;
  }

  /** Takes them off again once the last engine is gone. */
  release() {
    if (this.engines > 0) this.engines -= 1;
    if (this.engines > 0 || !this.xhr) return;
    this.xhr.offRequest?.(this.handleRequest);
    this.xhr.offResponse?.(this.handleResponse);
    this.xhr = undefined;
  }

  private readonly handleRequest: VhsRequestHook = (options) => {
    const router = this.registry.findBySrc(options.uri);
    router?.noteTopLevelManifestRequest(options.uri);
    return options;
  };

  private readonly handleResponse: VhsResponseHook = (
    request,
    error,
    response,
  ) => {
    const router = this.registry.findBySrc(request.uri ?? "");
    router?.readTopLevelManifest(request, error, response);
  };
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
   * the player's current source.
   *
   * Reading it here is the fallback for the two cases the page-wide hooks
   * cannot cover: an engine bound to a player that already loaded a source,
   * and a video.js with no hook registry to install them on. It costs a
   * second fetch of that manifest, and on a CDN that signs its media playlist
   * URLs per response — Amazon IVS does — the second response names playlists
   * the player will never ask for, leaving the core unable to recognize the
   * ones it does. Binding before the player loads a source avoids both.
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
          requestedUrl: src,
          data: bodyOf(response),
        }),
      );
    });
  }

  /**
   * The player's first manifest request of a source has gone out, seen
   * through the page-wide hooks. Its own hooks take every request after it.
   */
  noteTopLevelManifestRequest(uri: string) {
    this.attachHooks();
    this.topLevelSrc = uri;
    this.noteSource(this.player.currentSrc());
  }

  /** That request's response, which is the manifest naming the streams. */
  readTopLevelManifest(
    request: VhsRequest,
    error: Error | null | undefined,
    response: VhsResponse,
  ) {
    if (error ?? !isOk(response.statusCode)) {
      // Let the next attempt at this source be read again.
      this.topLevelSrc = undefined;
      return;
    }
    const uri = request.uri ?? "";
    this.process(() =>
      this.core.processManifest({
        // A request's URI is what VHS asked for; its response URL follows
        // redirects, and the manifest's own URIs resolve against that.
        url: urlOf(request, uri),
        requestedUrl: uri,
        data: bodyOf(response, request),
      }),
    );
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
          requestedUrl: uri,
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
