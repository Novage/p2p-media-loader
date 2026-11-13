/**
 * The slice of dash.js's request plumbing the adapter touches, typed
 * structurally. dash.js's own declarations for these live in
 * `@svta/cml-request`, a transitive dependency this package cannot import
 * directly, and the adapter needs only a handful of fields.
 */

/** `HTTPRequest.*_TYPE` values a request carries in `customData.request.type`. */
export const REQUEST_TYPE = {
  MPD: "MPD",
  INIT_SEGMENT: "InitializationSegment",
  MEDIA_SEGMENT: "MediaSegment",
  INDEX_SEGMENT: "IndexSegment",
} as const;

/** What `_onprogress` in dash.js's HTTPLoader reads off a progress event. */
export type ProgressEventLike = {
  lengthComputable: boolean;
  loaded: number;
  total: number;
  /** Trace duration in ms; dash.js uses it instead of the wall clock when set. */
  time?: number;
};

/** The dash.js `FragmentRequest` (or `TextRequest`) behind a network request. */
type FragmentRequestLike = {
  type?: string | null;
  url?: string | null;
  range?: string | null;
  mediaType?: string | null;
  /** Presentation time of a media segment; `NaN` on an index probe. */
  startTime?: number | null;
};

/** Callbacks and state dash.js's HTTPLoader hangs on a request. */
type RequestCustomData = {
  request?: FragmentRequestLike;
  onloadend?: () => void;
  onprogress?: (event: ProgressEventLike) => void;
  onabort?: () => void;
  ontimeout?: (event: unknown) => void;
  abort?: () => void;
};

/** `CommonMediaRequest` as HTTPLoader builds it. */
export type CommonMediaRequestLike = {
  url: string;
  method?: string;
  responseType?: string;
  headers?: Record<string, string | undefined>;
  customData?: RequestCustomData;
};

/** `CommonMediaResponse` as HTTPLoader expects the loader to fill it. */
export type CommonMediaResponseLike = {
  url?: string;
  status: number;
  statusText?: string;
  headers?: Record<string, string> | null;
  data?: unknown;
};

/** The instance dash.js's own `XHRLoader` factory produces. */
export type XhrLoaderLike = {
  load(
    request: CommonMediaRequestLike,
    response: CommonMediaResponseLike,
  ): boolean;
  /** dash.js names the request it abandons; its own loader ignores the name. */
  abort(request?: CommonMediaRequestLike): void;
};

/**
 * What `FactoryMaker` binds as `this` when it applies an `override`
 * extension: the real instance is `parent`.
 */
export type FactoryMakerThis = {
  context: object;
  factory: unknown;
  parent: XhrLoaderLike;
};
