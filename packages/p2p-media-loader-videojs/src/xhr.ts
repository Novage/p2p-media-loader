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

/**
 * How long the fallback manifest fetch may take. It is not a request the
 * player is waiting on — playback proceeds either way — but one that never
 * settles would leave its source noted as read and block every later attempt
 * at it.
 */
const MANIFEST_FETCH_TIMEOUT_MS = 20_000;

/** The routers of every bound engine on the page, for the one global hook. */
export class RouterRegistry {
  private readonly routers = new Set<RequestRouter>();

  add(router: RequestRouter) {
    this.routers.add(router);
  }

  remove(router: RequestRouter) {
    this.routers.delete(router);
  }

  /**
   * The router whose player is loading exactly this URL — and only when it is
   * the one such player. VHS's page-wide hooks say nothing about which player
   * a request came from, so two bound players on one source are two answers
   * to the same question: handing the manifest to the first would give it to
   * a player that never asked for it, and leave the other without. Neither
   * gets it here; each reads its own on `loadstart` instead. Only a VHS that
   * does not announce its per-player hooks gets this far at all.
   */
  findBySrc(uri: string): RequestRouter | undefined {
    let found: RequestRouter | undefined;
    for (const router of this.routers) {
      if (!router.matchesSrc(uri)) continue;
      if (found) return undefined;
      found = router;
    }
    return found;
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
  /**
   * How many bound engines each xhr function's hooks are held for. Counted
   * per function rather than once overall: `videojs.Vhs.xhr` is built once
   * per Video.js namespace, but an integrator may replace it and a page may
   * carry two namespaces, and hooks left on a function no engine holds any
   * more would stay there for good.
   */
  private readonly held = new Map<VhsXhr, number>();

  constructor(private readonly registry: RouterRegistry) {}

  /**
   * Installs the hooks, once, for as long as an engine is bound.
   *
   * @returns the function they went on, to hand back to `release`, or
   * `undefined` when this Video.js has no hook registry to install them on
   * and the engine has to read the manifest itself instead.
   */
  retain(videojs: VideoJsLike): VhsXhr | undefined {
    const { xhr } = videojs.Vhs;
    const engines = this.held.get(xhr);
    if (engines !== undefined) {
      this.held.set(xhr, engines + 1);
      return xhr;
    }
    if (!xhr.onRequest || !xhr.onResponse) return undefined;
    xhr.onRequest(this.handleRequest);
    xhr.onResponse(this.handleResponse);
    this.held.set(xhr, 1);
    return xhr;
  }

  /** Takes them off again once the last engine holding that one is gone. */
  release(xhr: VhsXhr) {
    const engines = this.held.get(xhr);
    if (engines === undefined) return;
    if (engines > 1) {
      this.held.set(xhr, engines - 1);
      return;
    }
    this.held.delete(xhr);
    // Taken off the sets rather than through `offRequest`: VHS's page-wide
    // hook methods close over its own namespace and resolve `Vhs.xhr` when
    // they are called, not the function they were put on. Asking a function
    // that is no longer the page's to drop a hook would take it off the one
    // that replaced it — which another engine is still relying on — and leave
    // it on this one for good. The sets are where the hooks live, and VHS
    // reads them off the function it is handed; an empty one is dropped, as
    // VHS's own remove helpers do.
    const requests = xhr._requestCallbackSet;
    if (requests) {
      requests.delete(this.handleRequest);
      if (!requests.size) delete xhr._requestCallbackSet;
    }
    const responses = xhr._responseCallbackSet;
    if (responses) {
      responses.delete(this.handleResponse);
      if (!responses.size) delete xhr._responseCallbackSet;
    }
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
 * "Video.js".
 *
 * The request hook hands VHS a request object of its own for every segment
 * the core can serve; the response hook reads the bytes of every playlist,
 * MPD and `sidx` VHS fetches. Neither touches any other player.
 */
export class RequestRouter {
  private readonly logger = debug("p2pml-videojs:loader");
  private readonly hooked = new Set<VhsXhr>();
  /**
   * The source the player is on, and whether its top-level manifest has been
   * taken care of — read already, or VHS's to read through these hooks.
   *
   * The two belong together. Which source the player is on decides what the
   * core holds, and what has been done about that source's manifest decides
   * whether anything here should fetch it; asking the player, the handler and
   * the request separately, at different moments, is how the two drift apart.
   * `enter` and `claim` are the only ways in.
   */
  private source?: { readonly src: string; claimed: boolean };
  /** Set once the engine lets this player go; nothing more reaches the core. */
  private released = false;
  /** The page-wide request this router took on, awaiting its response. */
  private pageWideRequest?: string;

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
    // VHS builds a new xhr function for every source, and the hook methods it
    // puts on that function close over the handler behind it. Holding one
    // after its source is gone holds a handler VHS has disposed, with its
    // controller and loaders, until the engine is destroyed — so let go of
    // every function that is no longer this player's. That includes the case
    // of no function at all, as after `player.reset()`, where the handler is
    // disposed and nothing replaces it.
    for (const previous of this.hooked) {
      if (previous !== xhr) this.removeHooks(previous);
    }
    if (!xhr || this.hooked.has(xhr)) return false;
    // A VHS that offers neither the hook methods nor the sets behind them is
    // one this adapter cannot reach: say so rather than appear to work, since
    // every request would go on loading over HTTP with nothing to show why.
    if (!xhr.onRequest && !xhr._requestCallbackSet) {
      this.logger(
        "this Video.js has no VHS request hooks; the player loads without P2P",
      );
    }
    if (xhr.onRequest) xhr.onRequest(this.handleRequest);
    else (xhr._requestCallbackSet ??= new Set()).add(this.handleRequest);
    if (xhr.onResponse) xhr.onResponse(this.handleResponse);
    else (xhr._responseCallbackSet ??= new Set()).add(this.handleResponse);
    this.hooked.add(xhr);
    return true;
  }

  detachHooks() {
    this.released = true;
    for (const xhr of this.hooked) this.removeHooks(xhr);
  }

  /** Takes this router's hooks off one xhr function and forgets it. */
  private removeHooks(xhr: VhsXhr) {
    if (xhr.offRequest) xhr.offRequest(this.handleRequest);
    else xhr._requestCallbackSet?.delete(this.handleRequest);
    if (xhr.offResponse) xhr.offResponse(this.handleResponse);
    else xhr._responseCallbackSet?.delete(this.handleResponse);
    this.hooked.delete(xhr);
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
   * Reading it here is the fallback for the cases the hooks cannot cover: an
   * engine bound to a player that already loaded a source, and a Video.js
   * with no hook registry to install them on. It costs a second fetch of that
   * manifest, and on a CDN that signs its media playlist URLs per response —
   * Amazon IVS does — the second response names playlists the player will
   * never ask for, leaving the core unable to recognize the ones it does.
   */
  ensureTopLevelManifest() {
    this.attachHooks();
    const src = this.player.currentSrc();
    if (!src) return;
    // The player has moved to this source, so the core stops holding the one
    // before it — whatever this one is. A source VHS does not handle at all,
    // a progressive MP4 or native HLS, gets no further than here, and a peer
    // left announcing and seeding the stream its player has left would go on
    // doing so for as long as the page lives. Only the fetch below depends on
    // VHS having taken the source on.
    this.enter(src);
    if (this.source?.claimed) return;
    // A player can carry a source that VHS has no handler for yet, and can
    // carry one while the handler on the tech is still the source before it:
    // `player.src(...)` caches the new source at once and hands it to the
    // tech a tick later, which is when the old handler goes. Either way this
    // source's manifest request is still ahead of these hooks rather than
    // behind them, and fetching it here would read a second response of the
    // same manifest while the player reads the first. `xhr-hooks-ready` and
    // `loadstart` both come back to this.
    const handler = this.player.tech(true)?.vhs;
    if (!handler) return;
    const handled = handler.source_?.src;
    if (handled !== undefined && handled !== src) return;
    // Holding the source is not having asked for it. Under `preload="none"`
    // VHS builds the handler and parks the manifest request until the first
    // `play`, so fetching here would load what the player was told not to
    // load, and the core would read the manifest a second time when the
    // viewer finally presses play. The hooks are on; the request comes to
    // them whenever VHS makes it.
    if (handler.playlistController_?.loadOnPlay_) return;
    this.claim(src);
    this.logger("reading the manifest VHS fetched before binding: %s", src);

    // Carrying the request options VHS carries for the same manifest: a CDN
    // that wants credentials answers a request without them 401, and a fetch
    // without a timeout that never settles would leave this source noted as
    // read and block every later attempt at it. What this cannot carry is the
    // player's own `onRequest` hooks — running them would mean running this
    // adapter's too, and reading the response twice — so an integrator who
    // signs requests in one of those must bind the engine before the player
    // loads a source, which is the better path regardless.
    this.videojs.xhr(
      {
        uri: src,
        withCredentials: this.withCredentials(),
        timeout: MANIFEST_FETCH_TIMEOUT_MS,
      },
      (error, response) => {
        if (error ?? !isOk(response.statusCode)) {
          // Let a later attempt at this source read it again; the core sees
          // this source's next manifest refresh meanwhile, and a VOD stream
          // that refreshes none stays on HTTP.
          if (this.source?.src === src) this.source.claimed = false;
          this.logger("could not read %s: %O", src, error);
          return;
        }
        // The player may have moved on, or the engine let go, while this was
        // in flight: what comes back then belongs to neither, and naming the
        // swarm after it would put this player in a swarm of its own.
        if (this.source?.src !== src || this.released) {
          this.logger("dropping the manifest of a source left behind: %s", src);
          return;
        }
        this.process(() =>
          this.core.processManifest({
            url: urlOf(response.rawRequest, src),
            requestedUrl: src,
            data: bodyOf(response),
          }),
        );
      },
    );
  }

  /** Whether VHS sends this player's playlist requests with credentials. */
  private withCredentials(): boolean {
    try {
      const tech = this.player.tech(true) as unknown as
        { vhs?: { options_?: { withCredentials?: boolean } } } | undefined;
      return tech?.vhs?.options_?.withCredentials === true;
    } catch {
      return false;
    }
  }

  /**
   * VHS has created this player's hooks for a source and has not yet asked
   * for its manifest: it announces them for exactly this, so the request goes
   * through them wherever it goes. Noting the source as VHS's to read keeps
   * the fallback off it however long that takes — with `preload="none"` VHS
   * holds the request back until playback starts, which is well after
   * `loadstart`, and a fetch there would both read a second response of the
   * manifest and load what the player was told not to load.
   */
  expectFirstManifest() {
    this.attachHooks();
    // The source this handler was built for, which is the one it is about to
    // ask for — not whatever the player is carrying now, which a second
    // `player.src(...)` may already have moved on from while this handler was
    // still being made.
    const handler = this.player.tech(true)?.vhs;
    const src = handler?.source_?.src ?? this.player.currentSrc();
    if (!src) return;
    this.claim(src);
  }

  /**
   * The player's first manifest request of a source has gone out, seen
   * through the page-wide hooks. Its own hooks take every request after it.
   */
  noteTopLevelManifestRequest(uri: string) {
    // VHS runs the page-wide hooks only for a player that has none of its
    // own, so once this router's are on this player's xhr function, whatever
    // reaches them came from a different player — a second, unbound one on
    // the same source. Its manifest is not this player's to read: on a CDN
    // that signs its media playlist URLs per response the two name different
    // playlists, and the core would hold a set this player never asks for.
    const xhr = this.player.tech(true)?.vhs?.xhr;
    if (xhr && this.hooked.has(xhr)) return;
    this.pageWideRequest = uri;
    this.attachHooks();
    this.claim(uri);
  }

  /** That request's response, which is the manifest naming the streams. */
  readTopLevelManifest(
    request: VhsRequest,
    error: Error | null | undefined,
    response: VhsResponse,
  ) {
    const uri = request.uri ?? "";
    // The response to the one request this router took through the page-wide
    // hooks, and no other; VHS settles the response hooks at request time, so
    // this one arrives here whatever was attached since.
    if (uri !== this.pageWideRequest) return;
    this.pageWideRequest = undefined;
    if (error ?? !isOk(response.statusCode)) {
      // Let the next attempt at this source be read again.
      if (this.source) this.source.claimed = false;
      return;
    }
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
      // Only a request for the source the player is on says anything about
      // which source that is. A media playlist belongs to whichever source is
      // current, and a top-level manifest for a source the player has already
      // left — VHS can still be asking for one while `player.src(...)` has
      // moved on — names the source behind, not the one ahead. Noting the
      // player's newest source here would reset the core for it before it
      // arrives, and leave nothing to reset when it does.
      if (uri === this.player.currentSrc()) this.claim(uri);
      return options;
    }
    if (requestType !== REQUEST_TYPE.SEGMENT) return options;

    const byteRange = byteRangeOf(options.headers);
    if (!this.core.isSegmentLoadable(uri, byteRange)) return options;
    return {
      ...options,
      xhr: new ServedRequest(this.core, uri, byteRange, this.bandwidth),
    };
  };

  /** What VHS makes of the network now, for a segment that did not use it. */
  private readonly bandwidth = (): number | undefined => {
    try {
      return this.player.tech(true)?.vhs?.bandwidth;
    } catch {
      return undefined;
    }
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

  /**
   * The player is on this source. Moving to one it was not on ends the core's
   * stream context: a peer left announcing and seeding a stream its player
   * has left would go on doing so for as long as the page lives. A refresh of
   * the same source is not a move, and changes nothing.
   */
  private enter(src: string) {
    if (this.source?.src === src) return;
    if (this.source) this.core.destroy();
    this.source = { src, claimed: false };
  }

  /**
   * This source's top-level manifest is read, or is VHS's to read through
   * these hooks — which is the same answer to the only question the fallback
   * asks, since both mean nothing here should fetch it.
   */
  private claim(src: string) {
    this.enter(src);
    if (this.source) this.source.claimed = true;
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

  /**
   * What this request is for, kept where nothing else can reach it.
   * `@videojs/xhr` drives the object it is handed as an `XMLHttpRequest` and
   * assigns `xhr.url = options.uri` on it, so a plain field of that name
   * would be replaced at send time by whatever the last request hook made of
   * the URI — a signed one, say — and the core would be asked for a segment
   * its registry never saw. The segment this serves is the one the hook
   * checked against the registry, whatever a later hook does to the request.
   */
  readonly #core: Core;
  readonly #url: string;
  readonly #byteRange: ByteRange;
  readonly #estimate: () => number | undefined;

  constructor(
    core: Core,
    url: string,
    byteRange: ByteRange,
    estimate: () => number | undefined,
  ) {
    this.#core = core;
    this.#url = url;
    this.#byteRange = byteRange;
    this.#estimate = estimate;
  }

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
    this.#core
      .loadSegment(this.#url, { byteRange: this.#byteRange })
      .then(({ data, bandwidth }) => {
        if (this.cancelled) return;
        this.response = data;
        this.responseURL = this.#url;
        this.status = 200;
        this.readyState = 4;
        this.bandwidth = this.#reportedBandwidth(bandwidth);
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
   * What to tell VHS the network is doing, having just told it nothing about
   * the network. The core's figure goes through when it has one; when it has
   * none — every session's first segment, before a single sample has been
   * recorded — VHS's own estimate goes back unchanged. Leaving the field
   * empty is not the same as leaving that estimate alone: VHS fills an empty
   * one by dividing the bytes by the time they took to arrive, and a segment
   * handed over from storage or a peer arrives in the same millisecond it was
   * asked for, which makes that `Infinity`. VHS saves it and reads it back as
   * room for every rendition there is.
   */
  #reportedBandwidth(bandwidth: number): number | undefined {
    if (bandwidth > 0) return Math.round(bandwidth);
    const current = this.#estimate();
    // No handler to hold an estimate means none to corrupt either.
    return current !== undefined && current > 0
      ? Math.round(current)
      : undefined;
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
    this.#core.abortSegmentLoading(this.#url, this.#byteRange);
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
