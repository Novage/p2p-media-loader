/**
 * Represents the types of streams available, either primary (main) or secondary.
 */
export type StreamType = "main" | "secondary";

/**
 * Represents a range of bytes, used for specifying a segment of data to download.
 */
export type ByteRange = {
  /**
   * The starting byte index of the range.
   */
  start: number;
  /**
   * The ending byte index of the range.
   */
  end: number;
};

/**
 * Describes a media segment with its unique identifiers, location, and timing information.
 */
export type Segment = {
  /**
   * A unique identifier for the segment within the local system.
   */
  readonly localId: string;

  /**
   * A unique identifier for the segment as recognized by external systems or servers.
   */
  readonly externalId: number;

  /**
   * The URL from which the segment can be downloaded.
   */
  readonly url: string;

  /**
   * An optional property specifying the range of bytes that represent the segment.
   */
  readonly byteRange?: ByteRange;

  /**
   * The start time of the segment in seconds, relative to the beginning of the stream.
   */
  readonly startTime: number;

  /**
   * The end time of the segment in seconds, relative to the beginning of the stream.
   */
  readonly endTime: number;
};

/**
 * Extends a Segment with a reference to its associated stream.
 */
export type SegmentWithStream = Segment & {
  readonly stream: StreamWithSegments;
};

/**
 * Represents a stream that includes multiple segments, each associated with the stream.
 * @template TStream Type of the underlying stream data structure.
 */
export type StreamWithSegments<TStream = Stream> = TStream & {
  readonly segments: Map<string, SegmentWithStream>;
};

/**
 * Represents a stream with a unique local identifier, type, and index position.
 */
export type Stream = {
  readonly localId: string;
  readonly type: StreamType;
  readonly index: number;
};

/**
 * Defines a subset of CoreConfig for dynamic updates, allowing selective modification of configuration properties.
 */
export type DynamicCoreConfig = Partial<
  Pick<
    CoreConfig,
    | "httpDownloadTimeWindow"
    | "p2pDownloadTimeWindow"
    | "p2pNotReceivingBytesTimeoutMs"
    | "httpNotReceivingBytesTimeoutMs"
  >
>;

/**
 * Configuration options for the Core functionality, including network and processing parameters.
 */
export type CoreConfig = {
  /** Time window to consider for high demand scenarios, in milliseconds.
   *
   * @default
   * ```typescript
   * highDemandTimeWindow: 15
   * ```
   */
  highDemandTimeWindow: number;

  /** Time window for HTTP downloads, in milliseconds.
   *
   * @default
   * ```typescript
   * httpDownloadTimeWindow: 45
   * ```
   */
  httpDownloadTimeWindow: number;

  /** Time window for P2P downloads, in milliseconds.
   *
   * @default
   * ```typescript
   * p2pDownloadTimeWindow: 45
   * ```
   */
  p2pDownloadTimeWindow: number;

  /** Maximum number of simultaneous HTTP downloads allowed.
   *
   * @default
   * ```typescript
   * simultaneousHttpDownloads: 3
   * ```
   */
  simultaneousHttpDownloads: number;

  /** Maximum number of simultaneous P2P downloads allowed.
   *
   * @default
   * ```typescript
   * simultaneousP2PDownloads: 3
   * ```
   */
  simultaneousP2PDownloads: number;

  /** Time after which a cached segment expires, in milliseconds.
   *
   * @default
   * ```typescript
   * cachedSegmentExpiration: 120 * 1000
   * ```
   */
  cachedSegmentExpiration: number;

  /** Maximum number of segments to store in the cache.
   *
   * @default
   * ```typescript
   * cachedSegmentsCount: 50
   * ```
   */
  cachedSegmentsCount: number;

  /** Maximum message size for WebRTC communications, in bytes.
   *
   * @default
   * ```typescript
   * webRtcMaxMessageSize: 64 * 1024 - 1
   * ```
   */
  webRtcMaxMessageSize: number;

  /** Timeout for not receiving bytes from P2P, in milliseconds.
   *
   * @default
   * ```typescript
   * p2pNotReceivingBytesTimeoutMs: 1000
   * ```
   */
  p2pNotReceivingBytesTimeoutMs: number;

  /** Timeout for destroying the P2P loader if inactive, in milliseconds.
   *
   * @default
   * ```typescript
   * p2pLoaderDestroyTimeoutMs: 30 * 1000
   * ```
   */
  p2pLoaderDestroyTimeoutMs: number;

  /** Timeout for not receiving bytes from HTTP downloads, in milliseconds.
   *
   * @default
   * ```typescript
   * httpNotReceivingBytesTimeoutMs: 1000
   * ```
   */
  httpNotReceivingBytesTimeoutMs: number;

  /** Number of retries allowed after an HTTP error.
   *
   * @default
   * ```typescript
   * httpErrorRetries: 3
   * ```
   */
  httpErrorRetries: number;

  /** Number of retries allowed after a P2P error.
   *
   * @default
   * ```typescript
   * p2pErrorRetries: 3
   * ```
   */
  p2pErrorRetries: number;

  /**
   * List of URLs to the trackers used for announcing and discovering peers.
   *
   * @default
   * The default trackers used are:
   * ```typescript
   * [
   *   "wss://tracker.openwebtorrent.com",
   *   "wss://tracker.novage.com.ua",
   * ]
   * ```
   */
  announceTrackers: string[];

  /**
   * Configuration for the RTC layer, used in WebRTC communication.
   * This configuration specifies the STUN/TURN servers used by WebRTC to establish connections through NATs and firewalls.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/RTCConfiguration
   *
   * @default
   * ```json
   * {
   *   "rtcConfig": {
   *     "iceServers": [
   *       { "urls": "stun:stun.l.google.com:19302" },
   *       { "urls": "stun:global.stun.twilio.com:3478" }
   *     ]
   *   }
   * }
   * ```
   */
  rtcConfig: RTCConfiguration;

  /** Prefix to use for the client version in tracker communications.
   *
   * @default
   * ```typescript
   * trackerClientVersionPrefix: "PM0100" // PM + VERSION
   * ```
   */
  trackerClientVersionPrefix: string;

  /** Optional unique identifier for the swarm, used to isolate peer pools. */
  swarmId?: string;

  /**
   * Optional function to validate a P2P segment before fully integrating it into the playback buffer.
   * @param url URL of the segment to validate.
   * @param byteRange Optional range of bytes to validate within the segment.
   * @returns A promise that resolves with a boolean indicating if the segment is valid.
   */
  validateP2PSegment?: (url: string, byteRange?: ByteRange) => Promise<boolean>;

  /**
   * Optional function to customize the setup of HTTP requests for segment downloads.
   * @param segmentUrl URL of the segment.
   * @param segmentByteRange The range of bytes requested for the segment.
   * @param requestAbortSignal An abort signal to cancel the request if needed.
   * @param requestByteRange Additional byte range for partial requests, if required.
   * @returns A promise that resolves with the configured request, or undefined if no request should be made.
   */
  httpRequestSetup?: (
    segmentUrl: string,
    segmentByteRange: ByteRange | undefined,
    requestAbortSignal: AbortSignal,
    requestByteRange: { start: number; end?: number } | undefined,
  ) => Promise<Request | undefined | null>;
};

/**
 * Specifies the source of a download, indicating whether it was from HTTP or P2P.
 */
export type DownloadSource = "http" | "p2p";

/**
 * Represents details about a segment event, including the segment itself, the source of download, and an optional peer ID.
 * @param {Segment} segment - The segment that the event is about.
 * @param {DownloadSource} downloadSource - The source of the download.
 * @param {string | undefined} peerId - The peer ID of the peer that the event is about, if applicable.
 */
export type SegmentStartDetails = {
  segment: Segment;
  downloadSource: DownloadSource;
  peerId: string | undefined;
};

/**
 * Represents details about a segment error event with an error property to provide details about a segment download error.
 * @param {RequestError} error - The error that occurred during the segment download.
 * @param {Segment} segment - The segment that the event is about.
 * @param {DownloadSource} downloadSource - The source of the download.
 * @param {string | undefined} peerId - The peer ID of the peer that the event is about, if applicable.
 */
export type SegmentErrorDetails = {
  error: RequestError;
  segment: Segment;
  downloadSource: DownloadSource;
  peerId: string | undefined;
};

/**
 * Represents details about a segment abort event, including the segment, the source of download, and an optional peer ID.
 * @param {Segment} segment - The segment that the event is about.
 * @param {DownloadSource | undefined} downloadSource - The source of the download.
 * @param {string | undefined} peerId - The peer ID of the peer that the event is about, if applicable.
 */
export type SegmentAbortDetails = {
  segment: Segment;
  downloadSource: DownloadSource | undefined;
  peerId: string | undefined;
};

/**
 * Represents the details about a loaded segment, including the length in bytes and the source of the download.
 * @param {number} bytesLength - The length of the segment in bytes.
 * @param {DownloadSource} downloadSource - The source of the download.
 */
export type SegmentLoadDetails = {
  bytesLength: number;
  downloadSource: DownloadSource;
  peerId: string | undefined;
};

/**
 * The CoreEventMap defines a comprehensive suite of event handlers crucial for monitoring and controlling the lifecycle
 * of segment downloading and uploading processes.
 */
export type CoreEventMap = {
  /**
   * Invoked when a segment is fully downloaded and available for use.
   *
   * @param {SegmentLoadDetails} params - Contains information about the loaded segment.
   */
  onSegmentLoaded: (params: SegmentLoadDetails) => void;

  /**
   * Triggered when an error occurs during the download of a segment.
   *
   * @param {SegmentErrorDetails} params - Contains information about the errored segment.
   */
  onSegmentError: (params: SegmentErrorDetails) => void;

  /**
   * Called if the download of a segment is aborted before completion.
   *
   * @param {SegmentAbortDetails} params - Contains information about the aborted segment.
   */
  onSegmentAbort: (params: SegmentAbortDetails) => void;

  /**
   * Fired at the beginning of a segment download process.
   *
   * @param {SegmentStartDetails} params - Provides details about the segment being downloaded.
   */
  onSegmentStart: (params: SegmentStartDetails) => void;

  /**
   * Occurs when a new peer-to-peer connection is established.
   *
   * @param {string} peerId - The unique identifier of the peer that has just connected.
   */
  onPeerConnect: (peerId: string) => void;

  /**
   * Triggered when an existing peer-to-peer connection is closed.
   *
   * @param {string} peerId - The unique identifier of the peer whose connection has been closed.
   */
  onPeerClose: (peerId: string) => void;

  /**
   * Invoked after a chunk of data from a segment has been successfully downloaded.
   *
   * @param {number} bytesLength - The size of the downloaded chunk in bytes, offering a measure of the download progress.
   * @param {DownloadSource} type - The source of the download.
   * @param {string} [peerId] - The peer ID of the peer that the event is about, if applicable.
   */
  onChunkDownloaded: (
    bytesLength: number,
    downloadSource: DownloadSource,
    peerId?: string,
  ) => void;

  /**
   * Called when a chunk of data has been successfully uploaded to a peer.
   *
   * @param {number} bytesLength - The length of the segment in bytes.
   * @param {string} peerId - The peer ID of the peer that the event is about, if applicable.
   */
  onChunkUploaded: (bytesLength: number, peerId: string) => void;
};

/**
 * Defines the types of errors that can occur during a request abortion process.
 */
export type RequestAbortErrorType = "abort" | "bytes-receiving-timeout";

/**
 * Defines the types of errors specific to HTTP requests.
 */
export type HttpRequestErrorType =
  | "http-error"
  | "http-bytes-mismatch"
  | "http-unexpected-status-code";

/**
 * Defines the types of errors specific to peer-to-peer requests.
 */
export type PeerRequestErrorType =
  | "peer-response-bytes-length-mismatch"
  | "peer-protocol-violation"
  | "peer-segment-absent"
  | "peer-closed"
  | "p2p-segment-validation-failed";

/**
 * Enumerates all possible request error types, including HTTP and peer-related errors.
 */
export type RequestErrorType =
  | RequestAbortErrorType
  | PeerRequestErrorType
  | HttpRequestErrorType;

/**
 * Represents an error that can occur during the request process, with a timestamp for when the error occurred.
 * @template T - The specific type of request error.
 */
export class RequestError<
  T extends RequestErrorType = RequestErrorType,
> extends Error {
  readonly timestamp: number;

  /**
   * Constructs a new RequestError.
   * @param type - The specific error type.
   * @param message - Optional message describing the error.
   */
  constructor(
    readonly type: T,
    message?: string,
  ) {
    super(message);
    this.timestamp = performance.now();
  }
}

/**
 * Represents the response from a segment request, including the data and measured bandwidth.
 */
export type SegmentResponse = {
  data: ArrayBuffer;
  bandwidth: number;
};

/**
 * Custom error class for errors that occur during core network requests.
 */
export class CoreRequestError extends Error {
  /**
   * Constructs a new CoreRequestError.
   * @param type - The type of the error, either 'failed' or 'aborted'.
   */
  constructor(readonly type: "failed" | "aborted") {
    super();
  }
}

/**
 * Callbacks for handling the success or failure of an engine operation.
 */
export type EngineCallbacks = {
  /**
   * Called when the operation is successful.
   * @param response - The response from the successful operation.
   */
  onSuccess: (response: SegmentResponse) => void;

  /**
   * Called when the operation encounters an error.
   * @param reason - The error encountered during the operation.
   */
  onError: (reason: CoreRequestError) => void;
};
