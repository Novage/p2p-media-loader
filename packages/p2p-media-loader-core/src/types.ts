import { SegmentStorage } from "./segment-storage/index.js";

/** Represents the types of streams available, either primary (main) or secondary. */
export type StreamType = "main" | "secondary";

/** Represents a range of bytes, used for specifying a segment of data to download. */
export type ByteRange = {
  /** The starting byte index of the range. */
  start: number;
  /** The ending byte index of the range. */
  end: number;
};

/** Describes a media segment with its unique identifiers, location, and timing information. */
export type Segment = {
  /** A runtime identifier for the segment that includes URL and byte range from its manifest. */
  readonly runtimeId: string;

  /** An unique identifier of the segment in its stream used for P2P communications: sequence number for HLS or playtime for MPEG-DASH. */
  readonly externalId: number;

  /** The URL from which the segment can be downloaded. */
  readonly url: string;

  /** An optional property specifying the range of bytes that represent the segment. */
  readonly byteRange?: ByteRange;

  /** The start time of the segment in seconds, relative to the beginning of the stream. */
  readonly startTime: number;

  /** The end time of the segment in seconds, relative to the beginning of the stream. */
  readonly endTime: number;
};

/** Extends a Segment with a reference to its associated stream. */
export type SegmentWithStream<TStream extends Stream = Stream> = Segment & {
  readonly stream: StreamWithSegments<TStream>;
};

/**
 * Represents a stream that includes multiple segments, each associated with the stream.
 * @template TStream Type of the underlying stream data structure.
 */
export type StreamWithSegments<TStream extends Stream = Stream> = TStream & {
  readonly segments: Map<string, SegmentWithStream<TStream>>;
};

/** Represents a media stream with various defining characteristics. */
export type Stream = {
  /** Runtime identifier of the stream from an engine. */
  readonly runtimeId: string;

  /** Stream type. */
  readonly type: StreamType;

  /** Stream index in the manifest. */
  readonly index: number;
};

/** Represents a defined Core configuration with specific settings for the main and secondary streams. */
export type DefinedCoreConfig = CommonCoreConfig & {
  /** Configuration for the main stream. */
  mainStream: StreamConfig;
  /** Configuration for the secondary stream. */
  secondaryStream: StreamConfig;
};

/** Represents a set of properties that can be dynamically modified at runtime. */
export type DynamicStreamProperties =
  | "highDemandTimeWindow"
  | "httpDownloadTimeWindow"
  | "p2pDownloadTimeWindow"
  | "simultaneousHttpDownloads"
  | "simultaneousP2PDownloads"
  | "webRtcMaxMessageSize"
  | "p2pNotReceivingBytesTimeoutMs"
  | "p2pInactiveLoaderDestroyTimeoutMs"
  | "httpNotReceivingBytesTimeoutMs"
  | "httpErrorRetries"
  | "p2pErrorRetries"
  | "validateP2PSegment"
  | "httpRequestSetup"
  | "isP2PDisabled";

/**
 * Represents a dynamically modifiable configuration, allowing updates to selected CoreConfig properties at runtime.
 *
 * @example
 * ```typescript
 * const dynamicConfig: DynamicCoreConfig = {
 *   core: {
 *     cachedSegmentsCount: 200,
 *   },
 *   mainStream: {
 *     swarmId: "custom swarm ID for video stream",
 *     p2pDownloadTimeWindow: 6000,
 *   },
 *   secondaryStream: {
 *     swarmId: "custom swarm ID for audio stream",
 *     p2pDownloadTimeWindow: 3000,
 *   }
 * };
 * ```
 */
export type DynamicCoreConfig = Partial<
  Pick<CoreConfig, DynamicStreamProperties>
> &
  Partial<CommonCoreConfig> & {
    /** Optional dynamic configuration for the main stream. */
    mainStream?: Partial<Pick<StreamConfig, DynamicStreamProperties>>;
    /** Optional dynamic configuration for the secondary stream. */
    secondaryStream?: Partial<Pick<StreamConfig, DynamicStreamProperties>>;
  };

/** Represents the configuration for the Core functionality that is common to all streams. */
export type CommonCoreConfig = {
  /**
   * Defines the memory storage limit for media segments, in MiB.
   *
   * @default
   * ```typescript
   * segmentMemoryStorageLimit: undefined
   * ```
   *
   * - When `undefined`, the default limit is determined based on the device type and browser:
   *    - Desktop: 4096 MiB
   *    - Android: 2048 MiB
   *    - iOS: 1024 MiB
   *    - Android WebView: 1024 MiB
   *    - iOS WebView: 1024 MiB
   *
   */
  segmentMemoryStorageLimit: number | undefined;

  /**
   * Optional custom storage factory for the segments storage.
   *
   * @default
   * ```typescript
   * customSegmentStorageFactory: undefined
   * ```
   */
  customSegmentStorageFactory?: (isLive: boolean) => SegmentStorage;
};

/**
 * Represents a set of configuration parameters that can be used to override or extend the
 * default configuration settings for a specific stream (main or secondary).
 *
 * @example Configuration for basic video stream
 *
 * ```typescript
 * const config: CoreConfig = {
 *  highDemandTimeWindow: 15,
 *  httpDownloadTimeWindow: 3000,
 *  p2pDownloadTimeWindow: 6000,
 *  swarmId: "custom swarm ID for video stream",
 *  cashedSegmentsCount: 1000,
 * }
 * ```
 *
 * @example Configuration for advanced video stream
 *
 * ```typescript
 * const config: CoreConfig = {
 *  // Configuration for both streams
 *  highDemandTimeWindow: 20,
 *  httpDownloadTimeWindow: 3000,
 *  p2pDownloadTimeWindow: 6000,
 *  mainStream: {
 *   // Optional configuration for the main stream
 *   swarmId: "custom swarm ID for video stream",
 *  },
 *  secondaryStream: {
 *   // Optional configuration for the secondary stream
 *   swarmId: "custom swarm ID for audio stream",
 *  },
 *  ```
 */
export type CoreConfig = Partial<StreamConfig> &
  Partial<CommonCoreConfig> & {
    /** Optional configuration for the main stream. */
    mainStream?: Partial<StreamConfig>;
    /** Optional configuration for the secondary stream. */
    secondaryStream?: Partial<StreamConfig>;
  };

/** Configuration options for the Core functionality, including network and processing parameters. */
export type StreamConfig = {
  /**
   * Indicates whether Peer-to-Peer (P2P) functionality is disabled for the stream.
   * If set to true, P2P functionality is disabled for the stream.
   *
   * @default
   * ```typescript
   * isP2PDisabled: false
   * ```
   */
  isP2PDisabled: boolean;
  /**
   * Defines the duration of the time window, in seconds, during which segments are pre-loaded to ensure smooth playback.
   * This window helps prioritize the fetching of media segments that are imminent to playback.
   *
   * @default
   * ```typescript
   * highDemandTimeWindow: 15
   * ```
   */
  highDemandTimeWindow: number;

  /**
   * Defines the time window, in seconds, for HTTP segment downloads. This property specifies the duration
   * over which media segments are pre-fetched using HTTP requests.
   *
   * For a better P2P ratio, it is recommended to set this `httpDownloadTimeWindow` to be lower than `p2pDownloadTimeWindow`.
   *
   * NOTE: This setting only takes effect if there is at least one peer connection and the connected peer
   * does not have the requested segments available to share via P2P.
   *
   * @default
   * ```typescript
   * httpDownloadTimeWindow: 3000
   * ```
   */
  httpDownloadTimeWindow: number;

  /**
   * Defines the time window, in seconds, dedicated to pre-fetching media segments via Peer-to-Peer (P2P) downloads.
   * This duration determines how much content is downloaded in advance using P2P connections to ensure smooth playback and reduce reliance on HTTP downloads.
   *
   * For a better P2P ratio, it is recommended to set this time window to be greater than `httpDownloadTimeWindow` to maximize P2P usage.
   *
   * @default
   * ```typescript
   * p2pDownloadTimeWindow: 6000
   * ```
   */
  p2pDownloadTimeWindow: number;

  /**
   * Maximum number of simultaneous HTTP downloads allowed.
   *
   * @default
   * ```typescript
   * simultaneousHttpDownloads: 2
   * ```
   */
  simultaneousHttpDownloads: number;

  /**
   * Maximum number of simultaneous P2P downloads allowed.
   *
   * @default
   * ```typescript
   * simultaneousP2PDownloads: 3
   * ```
   */
  simultaneousP2PDownloads: number;

  /**
   * Maximum message size for WebRTC communications, in bytes.
   *
   * @default
   * ```typescript
   * webRtcMaxMessageSize: 64 * 1024 - 1
   * ```
   */
  webRtcMaxMessageSize: number;

  /**
   * Timeout for not receiving bytes from P2P, in milliseconds.
   *
   * @default
   * ```typescript
   * p2pNotReceivingBytesTimeoutMs: 2000
   * ```
   */
  p2pNotReceivingBytesTimeoutMs: number;

  /**
   * Timeout for destroying the P2P loader if inactive, in milliseconds.
   *
   * @default
   * ```typescript
   * p2pInactiveLoaderDestroyTimeoutMs: 30 * 1000
   * ```
   */
  p2pInactiveLoaderDestroyTimeoutMs: number;

  /**
   * Timeout for not receiving bytes from HTTP downloads, in milliseconds.
   *
   * @default
   * ```typescript
   * httpNotReceivingBytesTimeoutMs: 3000
   * ```
   */
  httpNotReceivingBytesTimeoutMs: number;

  /**
   * Number of retries allowed after an HTTP error.
   *
   * @default
   * ```typescript
   * httpErrorRetries: 3
   * ```
   */
  httpErrorRetries: number;

  /**
   * Number of retries allowed after a P2P error.
   *
   * @default
   * ```typescript
   * p2pErrorRetries: 3
   * ```
   */
  p2pErrorRetries: number;

  /**
   * List of URLs to the WebTorrent trackers used for announcing and discovering peers (i.e. WebRTC signaling).
   *
   * WARNING: In the Safari browser, only the first tracker will be used. Safari has issues with multiple trackers,
   * leading to problems with sending SDP messages for WebRTC signaling.
   *
   * @default
   * The default trackers used are:
   * ```typescript
   * [
   *   "wss://tracker.novage.com.ua",
   *   "wss://tracker.webtorrent.dev",
   *   "wss://tracker.openwebtorrent.com",
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

  /**
   * Prefix to use for the WebTorrent client version in tracker communications.
   * If undefined, the default version prefix is used, which is calculated based on the package version.
   *
   * @default
   * ```typescript
   * trackerClientVersionPrefix: undefined
   * ```
   */
  trackerClientVersionPrefix: string;

  /**
   * Optional unique identifier for the swarm, used to isolate peer pools by media stream.
   * If undefined, the URL of the manifest is used as the swarm ID.
   * @default
   * ```typescript
   * swarmId: undefined
   * ```
   */
  swarmId?: string;

  /**
   * Optional function to validate a P2P segment before fully integrating it into the playback buffer.
   * @param url URL of the segment to validate.
   * @param byteRange Optional byte range of the segment.
   * @param data: Downloaded segment data.
   * @returns A promise that resolves with a boolean indicating if the segment is valid.
   *
   * @default
   * ```typescript
   * validateP2PSegment: undefined
   * ```
   */
  validateP2PSegment?: (url: string, byteRange: ByteRange | undefined, data: ArrayBuffer) => Promise<boolean>;

  /**
   * Optional function to customize the setup of HTTP requests for segment downloads.
   * @param segmentUrl URL of the segment.
   * @param segmentByteRange The range of bytes requested for the segment.
   * @param requestAbortSignal An abort signal to cancel the request if needed.
   * @param requestByteRange Additional byte range for partial requests, if required.
   * @returns A promise that resolves with the configured request, or undefined if no customization should be made.
   *
   * @default
   * ```typescript
   * httpRequestSetup: undefined
   * ```
   */
  httpRequestSetup?: (
    segmentUrl: string,
    segmentByteRange: ByteRange | undefined,
    requestAbortSignal: AbortSignal,
    requestByteRange: { start: number; end?: number } | undefined,
  ) => Promise<Request | undefined | null>;
};

/**
 * Specifies the source of a download within a media streaming context.
 *
 * "http" - Indicates that the segment was downloaded using the HTTP protocol.
 *
 * "p2p"- Indicates that the segment was downloaded through a peer-to-peer network.
 */
export type DownloadSource = "http" | "p2p";

/** Represents details about a segment event. */
export type SegmentStartDetails = {
  /** The segment that the event is about. */
  segment: Segment;

  /** The origin of the segment download. */
  downloadSource: DownloadSource;

  /** The peer ID, if the segment is downloaded from a peer. */
  peerId: string | undefined;
};

/** Represents details about a segment error event. */
export type SegmentErrorDetails = {
  /** The error that occurred during the segment download. */
  error: RequestError;

  /** The segment that the event is about. */
  segment: Segment;

  /** The source of the download. */
  downloadSource: DownloadSource;

  /** The peer ID, if the segment was downloaded from a peer. */
  peerId: string | undefined;

  /** The type of stream that the segment is associated with. */
  streamType: StreamType;
};

/** Represents details about a segment abort event. */
export type SegmentAbortDetails = {
  /** The segment that the event is about. */
  segment: Segment;

  /** The source of the download. */
  downloadSource: DownloadSource | undefined;

  /** The peer ID, if the segment was downloaded from a peer. */
  peerId: string | undefined;

  /** The type of stream that the segment is associated with. */
  streamType: StreamType;
};

/** Represents the details about a loaded segment. */
export type SegmentLoadDetails = {
  /** The URL of the loaded segment */
  segmentUrl: string;

  /** The length of the segment in bytes. */
  bytesLength: number;

  /** The source of the download. */
  downloadSource: DownloadSource;

  /** The peer ID, if the segment was downloaded from a peer. */
  peerId: string | undefined;

  /** The segment that the event is about. */
  streamType: StreamType;
};

/** Represents the details of a peer in a peer-to-peer network. */
export type PeerDetails = {
  /** The unique identifier for a peer in the network. */
  peerId: string;
  /** The type of stream that the peer is connected to. */
  streamType: StreamType;
};

/** Represents the details of a peer error event. */
export type PeerErrorDetails = {
  /** The unique identifier for a peer in the network. */
  peerId: string;
  /** The type of stream that the peer is connected to. */
  streamType: StreamType;
  /** The error that occurred during the peer-to-peer connection. */
  error: Error;
};

/** Represents the details of a tracker error event. */
export type TrackerErrorDetails = {
  /** The type of stream that the tracker is for. */
  streamType: StreamType;
  /** The error that occurred during the tracker request. */
  error: unknown;
};

export type TrackerWarningDetails = {
  /** The type of stream that the tracker is for. */
  streamType: StreamType;
  /** The warning that occurred during the tracker request. */
  warning: unknown;
};

/**
 * The CoreEventMap defines a comprehensive suite of event handlers crucial for monitoring and controlling the lifecycle
 * of segment downloading and uploading processes.
 */
export type CoreEventMap = {
  /**
   * Invoked when a segment is fully downloaded and available for use.
   *
   * @param params - Contains information about the loaded segment.
   */
  onSegmentLoaded: (params: SegmentLoadDetails) => void;

  /**
   * Triggered when an error occurs during the download of a segment.
   *
   * @param params - Contains information about the errored segment.
   */
  onSegmentError: (params: SegmentErrorDetails) => void;

  /**
   * Called if the download of a segment is aborted before completion.
   *
   * @param params - Contains information about the aborted segment.
   */
  onSegmentAbort: (params: SegmentAbortDetails) => void;

  /**
   * Fired at the beginning of a segment download process.
   *
   * @param params - Provides details about the segment being downloaded.
   */
  onSegmentStart: (params: SegmentStartDetails) => void;

  /**
   * Occurs when a new peer-to-peer connection is established.
   *
   * @param params - Contains details about the peer that the event is about.
   */
  onPeerConnect: (params: PeerDetails) => void;

  /**
   * Triggered when an existing peer-to-peer connection is closed.
   *
   * @param params - Contains details about the peer that the event is about.
   */
  onPeerClose: (params: PeerDetails) => void;

  /**
   * Triggered when an error occurs during a peer-to-peer connection.
   *
   * @param params - Contains details about the error and the peer that the event is about.
   */
  onPeerError: (params: PeerErrorDetails) => void;

  /**
   * Invoked after a chunk of data from a segment has been successfully downloaded.
   *
   * @param bytesLength - The size of the downloaded chunk in bytes.
   * @param downloadSource - The source of the download.
   * @param peerId - The peer ID of the peer that the event is about, if applicable.
   */
  onChunkDownloaded: (
    bytesLength: number,
    downloadSource: DownloadSource,
    peerId?: string,
  ) => void;

  /**
   * Called when a chunk of data has been successfully uploaded to a peer.
   *
   * @param bytesLength - The length of the segment in bytes.
   * @param peerId - The peer ID, if the segment was downloaded from a peer
   */
  onChunkUploaded: (bytesLength: number, peerId: string) => void;

  /**
   * Called when an error occurs during the tracker request process.
   *
   * @param params - Contains information about the tracker error.
   */
  onTrackerError: (params: TrackerErrorDetails) => void;

  /**
   * Called when a warning occurs during the tracker request process.
   *
   * @param params - Contains information about the tracker warning.
   */
  onTrackerWarning: (params: TrackerWarningDetails) => void;
};

/** Defines the types of errors that can occur during a request abortion process. */
export type RequestAbortErrorType = "abort" | "bytes-receiving-timeout";

/** Defines the types of errors specific to HTTP requests. */
export type HttpRequestErrorType =
  | "http-error"
  | "http-bytes-mismatch"
  | "http-unexpected-status-code";

/** Defines the types of errors specific to peer-to-peer requests. */
export type PeerRequestErrorType =
  | "peer-response-bytes-length-mismatch"
  | "peer-protocol-violation"
  | "peer-segment-absent"
  | "peer-closed"
  | "p2p-segment-validation-failed";

/** Enumerates all possible request error types, including HTTP and peer-related errors. */
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
  /** Error timestamp. */
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

/** Represents the response from a segment request, including the data and measured bandwidth. */
export type SegmentResponse = {
  /** Segment data as an ArrayBuffer. */
  data: ArrayBuffer;

  /** Measured bandwidth for the segment download, in bytes per second. */
  bandwidth: number;
};

/** Custom error class for errors that occur during core network requests. */
export class CoreRequestError extends Error {
  /**
   * Constructs a new CoreRequestError.
   * @param type - The type of the error, either 'failed' or 'aborted'.
   */
  constructor(readonly type: "failed" | "aborted") {
    super();
  }
}

/** Callbacks for handling the success or failure of an engine operation. */
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
