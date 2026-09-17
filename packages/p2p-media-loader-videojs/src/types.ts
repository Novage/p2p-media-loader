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
  uri: string;
  requestType?: string;
  responseType?: string;
  headers?: Record<string, string | undefined>;
  withCredentials?: boolean;
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
  statusCode: number;
  headers?: Record<string, string>;
  body?: unknown;
  /** The requested URL, before any redirect. */
  url?: string;
  /** The request object the response was read from. */
  rawRequest?: VhsRequest;
};

export type VhsCallback = (error: Error | null, response: VhsResponse) => void;

/**
 * What VHS expects an xhr function to return: enough of an `XMLHttpRequest`
 * for its callback wrapper, segment loader and playlist loader to read.
 */
export type VhsRequest = {
  abort(): void;
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
  uri?: string;
  requestType?: string;
  /** The request headers, as `@videojs/xhr` records them on the object. */
  headers?: Record<string, string | undefined>;
  requestTime?: number;
  responseType?: string;
  response?: unknown;
  responseText?: string;
  responseURL?: string;
  status?: number;
  aborted?: boolean;
  timedout?: boolean;
  /** Bits per second; VHS keeps a preset value instead of measuring. */
  bandwidth?: number;
};

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
  beforeRequest?: VhsRequestHook;
  _requestCallbackSet?: Set<VhsRequestHook>;
  _responseCallbackSet?: Set<VhsResponseHook>;
  onRequest?(callback: VhsRequestHook): void;
  offRequest?(callback: VhsRequestHook): void;
  onResponse?(callback: VhsResponseHook): void;
  offResponse?(callback: VhsResponseHook): void;
};

/** A VHS rendition as `vhs.representations()` lists them. */
export type VhsRepresentation = {
  id: string;
  width?: number;
  height?: number;
  bandwidth?: number;
  enabled(enable?: boolean): boolean | undefined;
};

/** The VHS handler behind a player's tech. */
export type VhsHandlerLike = {
  xhr: VhsXhr;
  representations?(): VhsRepresentation[];
};

export type VideoJsTechLike = {
  el(): Element | null;
  vhs?: VhsHandlerLike;
};

/** The player surface the engine uses; a real `videojs.Player` satisfies it. */
export type VideoJsPlayerLike = {
  tech(safety?: boolean): VideoJsTechLike | undefined;
  currentSrc(): string;
  on(type: string, listener: () => void): void;
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
  xhr: (options: VhsRequestOptions, callback: VhsCallback) => VhsRequest;
  Vhs: { xhr: VhsXhr };
  registerPlugin(name: string, plugin: (...args: never[]) => unknown): unknown;
  getPlugin(name: string): unknown;
  deregisterPlugin(name: string): void;
};
