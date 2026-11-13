/**
 * The slice of Video.js and VHS (`@videojs/http-streaming`) the adapter
 * touches, typed structurally: Video.js's declarations do not describe
 * `videojs.Vhs`, and the adapter needs a handful of fields.
 */

/** `requestType` values VHS puts on its request options. */
export const REQUEST_TYPE = {
  HLS_PLAYLIST: "hls-playlist",
  DASH_MANIFEST: "dash-manifest",
  DASH_SIDX: "dash-sidx",
  SEGMENT: "segment",
} as const;

/** The options object VHS hands its xhr function. */
export type VhsRequestOptions = {
  /** The URL to request. The adapter looks it up in the core, and compares it with the player's source. */
  uri: string;
  /** What VHS requests (see `REQUEST_TYPE`). The adapter routes each request by it. */
  requestType?: string;
  /** The `XMLHttpRequest.responseType` VHS asks for. */
  responseType?: string;
  /** Request headers. The adapter reads the segment's byte range from `Range`. */
  headers?: Record<string, string | undefined>;
  /** Whether to send credentials. The adapter's own manifest fetch copies VHS's setting. */
  withCredentials?: boolean;
  /** Timeout in milliseconds. The adapter's own manifest fetch sets one, so it always settles. */
  timeout?: number;
  /**
   * `@videojs/xhr` drives this object instead of constructing an
   * `XMLHttpRequest` when it is set; the adapter hands it a segment served
   * by the core.
   */
  xhr?: VhsRequest;
};

/** The response object `videojs.xhr` passes to its callback. */
export type VhsResponse = {
  /** HTTP status. The adapter reads a response only when it is 2xx. */
  statusCode: number;
  /** Response headers. */
  headers?: Record<string, string>;
  /** The response body. The adapter uses it when the request object holds no body of its own. */
  body?: unknown;
  /** The requested URL, before any redirect. */
  url?: string;
  /** The request object the response was read from. */
  rawRequest?: VhsRequest;
};

/** The callback of an xhr function: an error or `null`, and the response. */
export type VhsCallback = (error: Error | null, response: VhsResponse) => void;

/**
 * What VHS expects an xhr function to return: enough of an `XMLHttpRequest`
 * for its callback wrapper, segment loader and playlist loader to read.
 */
export type VhsRequest = {
  /** Cancels the request. On a segment the core serves, it also stops the core's load. */
  abort(): void;
  /**
   * VHS listens for `progress` on a segment request, to give up on a slow
   * one early. A segment the core serves arrives whole and sends none.
   */
  addEventListener(type: string, listener: (event: unknown) => void): void;
  /** Removes a listener that `addEventListener` added. */
  removeEventListener(type: string, listener: (event: unknown) => void): void;
  /** The URL VHS asked for, which VHS sets on the object. The adapter matches responses by it. */
  uri?: string;
  /** The `requestType` of the options, which VHS sets on the object. */
  requestType?: string;
  /** The request headers, as `@videojs/xhr` records them on the object. */
  headers?: Record<string, string | undefined>;
  /** When VHS sent the request, in epoch milliseconds; VHS measures the round trip from it. */
  requestTime?: number;
  /** `"arraybuffer"` when the body is in `response`; otherwise it is in `responseText`. */
  responseType?: string;
  /** The body as bytes, for an `"arraybuffer"` request. */
  response?: unknown;
  /** The body as text, for a request that is not `"arraybuffer"`. */
  responseText?: string;
  /** The URL the response came from, after redirects. The core resolves the manifest's URIs against it. */
  responseURL?: string;
  /** HTTP status. A segment the core serves reports 200. */
  status?: number;
  /** Set by VHS when it aborts the request; VHS then reports it as aborted, not as failed. */
  aborted?: boolean;
  /** Set by VHS when the request ran out of time. */
  timedout?: boolean;
  /** Bits per second; VHS keeps a preset value instead of measuring. */
  bandwidth?: number;
};

/**
 * An `onRequest` hook. VHS calls it with the options of each request before
 * it sends the request, and sends the options it returns.
 */
export type VhsRequestHook = (options: VhsRequestOptions) => VhsRequestOptions;

/** An `onResponse` hook; VHS calls it before its own callback wrapper. */
export type VhsResponseHook = (
  request: VhsRequest,
  error: Error | null | undefined,
  response: VhsResponse,
) => void;

/** An xhr function as VHS builds one, with its hook registry attached. */
export type VhsXhr = ((
  options: VhsRequestOptions,
  callback: VhsCallback,
) => VhsRequest) & {
  /** True on VHS's own function; a replacement leaves it unset. */
  original?: boolean;
  /** VHS's deprecated single request hook, which VHS still runs. The adapter does not use it. */
  beforeRequest?: VhsRequestHook;
  /**
   * The request hooks, as VHS keeps them (a VHS internal). The adapter adds
   * to it directly where `onRequest` is missing. It also removes its
   * page-wide hook here directly, because VHS's page-wide `offRequest` acts
   * on whatever function `Vhs.xhr` is at the time of the call.
   */
  _requestCallbackSet?: Set<VhsRequestHook>;
  /** The response hooks, as VHS keeps them (a VHS internal). Used as `_requestCallbackSet` is. */
  _responseCallbackSet?: Set<VhsResponseHook>;
  /** Adds a request hook. The adapter adds one to hand VHS the segments the core serves. */
  onRequest?(callback: VhsRequestHook): void;
  /** Removes a request hook. */
  offRequest?(callback: VhsRequestHook): void;
  /** Adds a response hook. The adapter adds one to read the manifests and `sidx` boxes VHS fetches. */
  onResponse?(callback: VhsResponseHook): void;
  /** Removes a response hook. */
  offResponse?(callback: VhsResponseHook): void;
};

/** A VHS rendition as `vhs.representations()` lists them. */
export type VhsRepresentation = {
  /** VHS's ID for the rendition, made from its index and its playlist URI. */
  id: string;
  /** Video width in pixels, from the manifest. */
  width?: number;
  /** Video height in pixels, from the manifest. */
  height?: number;
  /** The manifest's `BANDWIDTH`, in bits per second. */
  bandwidth?: number;
  /**
   * With no argument, tells whether VHS may select the rendition. With an
   * argument, allows or prevents it. The adapter does not use it; an
   * integrator can pin a quality with it.
   */
  enabled(enable?: boolean): boolean | undefined;
};

/** The VHS handler behind a player's tech. */
export type VhsHandlerLike = {
  /**
   * This player's own xhr function, which VHS builds again for each source.
   * The adapter puts its request and response hooks on it.
   */
  xhr: VhsXhr;
  /**
   * The source this handler was created for, as VHS records it. VHS takes
   * some options from the source object itself, `llhls` among them.
   */
  source_?: {
    /** The source URL. The adapter takes it as the source to read the manifest for. */
    src?: string;
    /** `llhls` given on the source object. If set, the adapter does not change it. */
    llhls?: boolean;
  };
  /**
   * VHS's controller for that source. `loadOnPlay_` is the manifest request
   * it has not made yet: under `preload="none"` VHS parks the load here and
   * runs it on the first `play`, clearing the field as it goes.
   */
  playlistController_?: VhsPlaylistControllerLike;
  /** The renditions VHS can select from. The adapter does not use it; an integrator can, for a quality menu. */
  representations?(): VhsRepresentation[];
  /** VHS's own bandwidth estimate, in bits per second. */
  bandwidth?: number;
  /**
   * The options VHS was created with; `withCredentials` goes on its requests,
   * and `llhls` decides whether it plays low-latency HLS by partial segments.
   */
  options_?: {
    /** Whether VHS sends its requests with credentials. */
    withCredentials?: boolean;
    /** Whether VHS plays low-latency HLS. The adapter sets it to `false` unless the integrator gave a value. */
    llhls?: boolean;
  };
};

/**
 * VHS's controller for one source, as far as the adapter reaches into it:
 * these are VHS internals, read with care for their absence.
 */
export type VhsPlaylistControllerLike = {
  /**
   * The manifest load VHS has postponed until the first `play`. While it is
   * set, the adapter does not fetch the manifest itself.
   */
  loadOnPlay_?: (() => void) | null;
  /** How far ahead of the playhead VHS buffers, read by its segment loaders. */
  goalBufferLength?: () => number;
  /** The loader of the top-level manifest, and what it parsed. */
  mainPlaylistLoader_?: {
    /** The top-level manifest as VHS parsed it. */
    main?: {
      /**
       * How far behind the live edge VHS plays, in seconds. The adapter
       * writes its live delay here, and puts the old value back on release.
       */
      suggestedPresentationDelay?: number;
    };
    /** Adds a listener. The adapter listens for `loadedplaylist`, to write the delay after each parse. */
    on(type: string, listener: () => void): void;
    /** Removes a listener that `on` added. */
    off(type: string, listener: () => void): void;
  };
};

/** VHS options as an integrator gives them: on the tech, or page-wide. */
export type VhsOptionsLike = {
  /** The VHS options. */
  vhs?: {
    /** Whether VHS plays low-latency HLS. If set, the adapter does not change it. */
    llhls?: boolean;
  };
};

/**
 * The player's tech — the object that drives the media element — as far as
 * the adapter reads it. VHS hangs its handler for the current source on it.
 */
export type VideoJsTechLike = {
  /** The tech's element. When it is an `HTMLMediaElement`, the adapter reads the playback state from it. */
  el(): Element | null;
  /** The VHS handler for the current source. Absent when VHS does not play the source. */
  vhs?: VhsHandlerLike;
  /** The tech's options, `html5` in the player's; VHS reads `vhs` here. */
  options_?: VhsOptionsLike;
};

/** The player surface the engine uses; a real `videojs.Player` satisfies it. */
export type VideoJsPlayerLike = {
  /**
   * The player's tech. The adapter passes `true`, which tells Video.js that
   * the access is intended and stops its warning.
   */
  tech(safety?: boolean): VideoJsTechLike | undefined;
  /** The URL of the current source. The adapter compares request URLs with it. */
  currentSrc(): string;
  /** Adds an event listener. The adapter listens for `xhr-hooks-ready`, `loadstart` and `dispose`. */
  on(type: string, listener: () => void): void;
  /** Removes an event listener that `on` added. */
  off(type: string, listener: () => void): void;
};

/** The `video.js` module's namespace, as its own declarations describe it. */
export type VideoJsNamespace = typeof import("video.js").default;

/**
 * The Video.js namespace surface the engine uses. Video.js's declarations do
 * not describe `Vhs`, so the real namespace is accepted alongside this shape
 * and checked at runtime.
 */
export type VideoJsLike = {
  /**
   * `videojs.xhr`. The adapter fetches the manifest with it only when it
   * cannot read the response VHS got, for example when bound to a player
   * that has loaded its source already.
   */
  xhr: (options: VhsRequestOptions, callback: VhsCallback) => VhsRequest;
  /** VHS's page-wide object. */
  Vhs: {
    /**
     * The page-wide xhr function. VHS runs its hooks for a player that has
     * no hooks of its own yet, which is how the adapter reads each source's
     * first manifest.
     */
    xhr: VhsXhr;
  };
  /** Page-wide defaults, under which VHS merges each tech's own options. */
  options?: VhsOptionsLike;
  /** Registers a player plugin. `registerPlugins` adds `p2pMediaLoader` with it. */
  registerPlugin(name: string, plugin: (...args: never[]) => unknown): unknown;
  /** Returns a registered plugin, if any. The engine does not replace a plugin of the same name. */
  getPlugin(name: string): unknown;
  /** Removes a registered plugin. `unregisterPlugins` uses it. */
  deregisterPlugin(name: string): void;
};
