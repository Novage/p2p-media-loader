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

  /** A unique identifier for the segment in its stream, used for P2P communications: sequence number for HLS or playtime for MPEG-DASH. */
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
  readonly index: string;
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
  | "httpDownloadInitialTimeoutMs"
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
  | "validateHTTPSegment"
  | "httpRequestSetup"
  | "isP2PDisabled"
  | "isP2PUploadDisabled"
  | "p2pMaxPeers"
  | "p2pChurnMaxPeersMultiplier"
  | "p2pChurnCleanupIntervalMs"
  | "p2pChurnGracePeriodMs"
  | "webRtcOffersCount"
  | "webRtcOfferTimeoutMs"
  | "webRtcIceGatheringTimeoutMs"
  | "webRtcConnectionTimeoutMs"
  | "rtcConfig";

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
    mainStream?: DynamicStreamConfig;
    /** Optional dynamic configuration for the secondary stream. */
    secondaryStream?: DynamicStreamConfig;
  };

/** Represents a partial configuration for a stream with dynamic properties. */
export type DynamicStreamConfig = Partial<
  Pick<StreamConfig, DynamicStreamProperties>
>;

/** Represents the configuration for the Core functionality that is common to all streams. */
export type CommonCoreConfig = {
  /**
   * Defines the memory storage limit for media segments (in MiB).
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
   * An optional custom storage factory for the segment storage.
   *
   * @default
   * ```typescript
   * customSegmentStorageFactory: undefined
   * ```
   */
  customSegmentStorageFactory?: (isLive: boolean) => SegmentStorage;

  /**
   * The prefix to use for the WebTorrent client version during tracker communications.
   *
   * @default
   * ```typescript
   * trackerClientVersionPrefix: `-PM${formattedPackageVersion}-`
   * ```
   */
  trackerClientVersionPrefix: string;
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
   * Controls whether peer-to-peer uploading is disabled for the stream.
   * If `true`, the stream will only download segments and will not upload to other peers.
   *
   * @default
   * ```typescript
   * isP2PUploadDisabled: false
   * ```
   */
  isP2PUploadDisabled: boolean;
  /**
   * Controls whether all peer-to-peer functionality is disabled for the stream.
   *
   * @default
   * ```typescript
   * isP2PDisabled: false
   * ```
   */
  isP2PDisabled: boolean;
  /**
   * Defines the duration of the time window (in seconds) during which segments are preemptively loaded to ensure smooth playback.
   * This window prioritizes the fetching of media segments that will be played imminently.
   *
   * @default
   * ```typescript
   * highDemandTimeWindow: 15
   * ```
   */
  highDemandTimeWindow: number;

  /**
   * Defines the time window (in seconds) for HTTP segment downloads. This property specifies the duration
   * over which media segments are preemptively fetched using HTTP requests.
   *
   * To achieve a higher P2P ratio, it is recommended to set `httpDownloadTimeWindow` lower than `p2pDownloadTimeWindow`.
   *
   * NOTE: This setting only takes effect if there is at least one peer connection, and the connected peer
   * does not have the requested segments available to share via P2P.
   *
   * @default
   * ```typescript
   * httpDownloadTimeWindow: 3000
   * ```
   */
  httpDownloadTimeWindow: number;

  /**
   * The delay (in milliseconds) before falling back to HTTP for the very first segments.
   * This allows the tracker time to discover peers when playback first begins.
   * A higher value provides a better opportunity to download initial segments via P2P, thereby improving the overall P2P ratio.
   * However, setting this value too high can increase playback startup time or stall playback if peers are not immediately available.
   * If set to `0`, the HTTP fallback will occur immediately.
   *
   * @default
   * ```typescript
   * httpDownloadInitialTimeoutMs: 0
   * ```
   */
  httpDownloadInitialTimeoutMs: number;

  /**
   * Defines the time window (in seconds) dedicated to preemptively fetching media segments via Peer-to-Peer (P2P) downloads.
   * This duration determines how much content is downloaded in advance via P2P connections to ensure smooth playback and reduce reliance on HTTP downloads.
   *
   * To achieve a higher P2P ratio, it is recommended to set this time window higher than `httpDownloadTimeWindow` to maximize P2P usage.
   *
   * @default
   * ```typescript
   * p2pDownloadTimeWindow: 6000
   * ```
   */
  p2pDownloadTimeWindow: number;

  /**
   * The maximum number of simultaneous HTTP downloads allowed.
   *
   * @default
   * ```typescript
   * simultaneousHttpDownloads: 2
   * ```
   */
  simultaneousHttpDownloads: number;

  /**
   * The maximum number of simultaneous P2P downloads allowed.
   *
   * @default
   * ```typescript
   * simultaneousP2PDownloads: 3
   * ```
   */
  simultaneousP2PDownloads: number;

  /**
   * The maximum message size for WebRTC communications, in bytes.
   *
   * @default
   * ```typescript
   * webRtcMaxMessageSize: 64 * 1024 - 1
   * ```
   */
  webRtcMaxMessageSize: number;

  /**
   * The timeout duration (in milliseconds) for not receiving bytes from a P2P connection.
   *
   * @default
   * ```typescript
   * p2pNotReceivingBytesTimeoutMs: 2000
   * ```
   */
  p2pNotReceivingBytesTimeoutMs: number;

  /**
   * The timeout duration (in milliseconds) before destroying the P2P loader if it remains inactive.
   *
   * @default
   * ```typescript
   * p2pInactiveLoaderDestroyTimeoutMs: 30 * 1000
   * ```
   */
  p2pInactiveLoaderDestroyTimeoutMs: number;

  /**
   * The timeout duration (in milliseconds) for not receiving bytes from an HTTP download.
   *
   * @default
   * ```typescript
   * httpNotReceivingBytesTimeoutMs: 3000
   * ```
   */
  httpNotReceivingBytesTimeoutMs: number;

  /**
   * The number of retries allowed following an HTTP error.
   *
   * @default
   * ```typescript
   * httpErrorRetries: 3
   * ```
   */
  httpErrorRetries: number;

  /**
   * The number of retries allowed following a P2P error.
   *
   * @default
   * ```typescript
   * p2pErrorRetries: 3
   * ```
   */
  p2pErrorRetries: number;

  /**
   * A list of URLs to the WebTorrent trackers used for announcing and discovering peers (i.e., WebRTC signaling).
   *
   * WARNING: In the Safari browser, only the first tracker will be utilized. Safari has known issues with multiple trackers,
   * which can lead to problems sending SDP messages during WebRTC signaling.
   *
   * @default
   * The default trackers used are:
   * ```typescript
   * [
   *   "wss://tracker.novage.com.ua",
   *   "wss://tracker.openwebtorrent.com",
   * ]
   * ```
   */
  announceTrackers: string[];

  /**
   * The configuration for the RTC layer, utilized during WebRTC communication.
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
   * An optional unique identifier for the swarm, used to isolate peer pools by media stream.
   * If left undefined, the manifest URL will be used as the swarm ID.
   * @default
   * ```typescript
   * swarmId: undefined
   * ```
   */
  swarmId?: string;

  /**
   * An optional function to validate a P2P segment before fully integrating it into the playback buffer.
   * @param url The URL of the segment to validate.
   * @param byteRange The optional byte range of the segment.
   * @param data The downloaded segment data.
   * @returns A promise that resolves to a boolean indicating whether the segment is valid.
   *
   * @default
   * ```typescript
   * validateP2PSegment: undefined
   * ```
   */
  validateP2PSegment?: (
    url: string,
    byteRange: ByteRange | undefined,
    data: ArrayBuffer,
  ) => Promise<boolean>;

  /**
   * An optional function to validate an HTTP segment before fully integrating it into the playback buffer.
   * @param url The URL of the segment to validate.
   * @param byteRange The optional byte range of the segment.
   * @param data The downloaded segment data.
   * @returns A promise that resolves to a boolean indicating whether the segment is valid.
   *
   * @default
   * ```typescript
   * validateHTTPSegment: undefined
   * ```
   */
  validateHTTPSegment?: (
    url: string,
    byteRange: ByteRange | undefined,
    data: ArrayBuffer,
  ) => Promise<boolean>;

  /**
   * An optional function to customize the setup of HTTP requests for segment downloads.
   * @param segmentUrl The URL of the segment.
   * @param segmentByteRange The range of bytes requested for the segment.
   * @param requestAbortSignal An abort signal to cancel the request if needed (will be `undefined` if `AbortController` is not supported by the browser).
   * @param requestByteRange An additional byte range for partial requests, if required.
   * @returns A promise that resolves to the configured request, or `undefined` if no customization is necessary.
   *
   * @default
   * ```typescript
   * httpRequestSetup: undefined
   * ```
   */
  httpRequestSetup?: (
    segmentUrl: string,
    segmentByteRange: ByteRange | undefined,
    requestAbortSignal: AbortSignal | undefined,
    requestByteRange: { start: number; end?: number } | undefined,
  ) => Promise<Request | undefined | null>;

  /**
   * The maximum number of active peer-to-peer connections for the stream.
   * If this limit is reached, the client will stop accepting new incoming offers
   * and cease requesting new peers from the tracker until the connection count drops.
   *
   * @default
   * ```typescript
   * p2pMaxPeers: 50
   * ```
   */
  p2pMaxPeers: number;

  /**
   * The multiplier applied to `p2pMaxPeers` to determine the hard limit for accepting incoming connections.
   * To keep the P2P swarm healthy and well-mixed, incoming connection offers are accepted up to this hard limit,
   * and a background cleanup process will periodically prune the worst-performing peers if the total count exceeds `p2pMaxPeers`.
   *
   * @default
   * ```typescript
   * p2pChurnMaxPeersMultiplier: 1.5
   * ```
   */
  p2pChurnMaxPeersMultiplier: number;

  /**
   * The interval (in milliseconds) at which the background churning process evaluates and prunes the worst-performing
   * peers if the total connection count exceeds `p2pMaxPeers`.
   *
   * @default
   * ```typescript
   * p2pChurnCleanupIntervalMs: 30000
   * ```
   */
  p2pChurnCleanupIntervalMs: number;

  /**
   * The duration (in milliseconds) of the grace period granted to new peers.
   * During this time, newly connected peers are protected from being dropped by the churning logic,
   * allowing them time to establish connections and prove their bandwidth.
   *
   * @default
   * ```typescript
   * p2pChurnGracePeriodMs: 15000
   * ```
   */
  p2pChurnGracePeriodMs: number;

  /**
   * The number of WebRTC offers to generate and send to the tracker per announce request.
   * This controls how aggressively the client attempts to discover new peers.
   *
   * @default
   * ```typescript
   * webRtcOffersCount: 5
   * ```
   */
  webRtcOffersCount: number;

  /**
   * The duration (in milliseconds) to keep a pending WebRTC offer alive while waiting for an answer from a remote peer.
   *
   * @default
   * ```typescript
   * webRtcOfferTimeoutMs: 50000
   * ```
   */
  webRtcOfferTimeoutMs: number;

  /**
   * The maximum duration (in milliseconds) to wait for ICE candidates to gather before sending an offer.
   *
   * @default
   * ```typescript
   * webRtcIceGatheringTimeoutMs: 5000
   * ```
   */
  webRtcIceGatheringTimeoutMs: number;

  /**
   * The maximum duration (in milliseconds) to wait for the actual RTCDataChannel to open after signaling has completed.
   *
   * @default
   * ```typescript
   * webRtcConnectionTimeoutMs: 15000
   * ```
   */
  webRtcConnectionTimeoutMs: number;
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

  /** The info hash of the swarm that the segment belongs to. */
  infoHash: string;

  /** The type of stream that the segment is associated with. */
  streamType: StreamType;
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

  /** The info hash of the swarm that the segment belongs to. */
  infoHash: string;

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

  /** The info hash of the swarm that the segment belongs to. */
  infoHash: string;

  /** The type of stream that the segment is associated with. */
  streamType: StreamType;
};

/** Represents the details about a loaded segment. */
export type SegmentLoadDetails = {
  /**
   * The URL of the loaded segment
   * @deprecated Use `segment.url` instead
   */
  segmentUrl: string;

  /** The segment that the event is about. */
  segment: Segment;

  /** The length of the segment in bytes. */
  bytesLength: number;

  /** The source of the download. */
  downloadSource: DownloadSource;

  /** The peer ID, if the segment was downloaded from a peer. */
  peerId: string | undefined;

  /** The info hash of the swarm that the segment belongs to. */
  infoHash: string;

  /** The type of stream that the segment is associated with. */
  streamType: StreamType;
};

/** Represents the details of a peer in a peer-to-peer network. */
export type PeerDetails = {
  /** The unique identifier for a peer in the network. */
  peerId: string;
  /** The info hash of the swarm that the peer is part of. */
  infoHash: string;
  /** The type of stream that the peer is connected to. */
  streamType: StreamType;
};

/** Represents the types of errors that can occur during a peer connection. */
export type PeerErrorType =
  | "transport-error"
  | "protocol-violation"
  | "bytes-length-mismatch"
  | "validation-failed"
  | "timeout"
  | "connection-lost";

/**
 * Base class for domain-specific errors carrying a machine-readable type discriminator.
 * @internal
 */
export abstract class TypedError<T extends string> extends Error {
  readonly cause?: unknown;

  constructor(
    readonly type: T,
    message?: string,
    cause?: unknown,
  ) {
    super(message);
    // Explicit assignment for ES6 compatibility (ErrorOptions with cause is ES2022)
    this.cause = cause;
  }
}

/** Represents an error that occurred during a peer connection. */
export class PeerError extends TypedError<PeerErrorType> {
  readonly name = "PeerError";
}

/** Represents the details of a peer error event. */
export type PeerErrorDetails = {
  /** The unique identifier for a peer in the network. */
  peerId: string;
  /** The info hash of the swarm that the peer is part of. */
  infoHash: string;
  /** The type of stream that the peer is connected to. */
  streamType: StreamType;
  /** The error that occurred during the peer-to-peer connection. */
  error: PeerError;
};

/** Represents the types of warnings that can occur during a peer connection. */
export type PeerWarningType = "timeout-strike";

/** Represents a warning that occurred during a peer connection. */
export class PeerWarning extends TypedError<PeerWarningType> {
  readonly name = "PeerWarning";
}

/** Represents the details of a peer warning event. */
export type PeerWarningDetails = {
  /** The unique identifier for a peer in the network. */
  peerId: string;
  /** The info hash of the swarm that the peer is part of. */
  infoHash: string;
  /** The type of stream that the peer is connected to. */
  streamType: StreamType;
  /** The warning that occurred during the peer-to-peer connection. */
  warning: PeerWarning;
};

/** Represents the details of a tracker error event. */
export type TrackerErrorDetails = {
  /** The tracker URL. */
  trackerUrl: string;
  /** The info hash of the swarm that the tracker is for. */
  infoHash: string;
  /** The type of stream that the tracker is for. */
  streamType: StreamType;
  /** The error that occurred during the tracker request. */
  error: TrackerError;
};

export type TrackerWarningDetails = {
  /** The tracker URL. */
  trackerUrl: string;
  /** The info hash of the swarm that the tracker is for. */
  infoHash: string;
  /** The type of stream that the tracker is for. */
  streamType: StreamType;
  /** The warning that occurred during the tracker request. */
  warning: TrackerWarning;
};

/** Represents the types of errors that can occur during the tracker request process. */
export type TrackerErrorType =
  | "announce-failed"
  | "parse-error"
  | "tracker-response"
  | "signaling-failed";

/** Represents an error that occurred during a tracker request. */
export class TrackerError extends TypedError<TrackerErrorType> {
  readonly name = "TrackerError";
}

/** Represents the types of warnings that can occur during the tracker request process. */
export type TrackerWarningType = "tracker-response" | "offer-failed";

/** Represents a warning that occurred during a tracker request. */
export class TrackerWarning extends TypedError<TrackerWarningType> {
  readonly name = "TrackerWarning";
}

/** Represents the types of errors that can occur during the peer connection process. */
export type PeerConnectErrorType = "connection-failed";

/** Represents an error that occurred while establishing a peer connection. */
export class PeerConnectError extends TypedError<PeerConnectErrorType> {
  readonly name = "PeerConnectError";
}

/** Represents the details of a peer connection error event. */
export type PeerConnectErrorDetails = {
  /** The unique identifier for a peer in the network. */
  peerId: string;
  /** The info hash of the swarm that the peer is connected to. */
  infoHash: string;
  /** The type of stream that the peer is connected to. */
  streamType: StreamType;
  /** The tracker URL that the peer was discovered from. */
  trackerUrl: string;
  /** The error that occurred during the peer-to-peer connection. */
  error: PeerConnectError;
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
   * Triggered when an error occurs while establishing a peer-to-peer connection.
   *
   * @param params - Contains details about the connection error and the peer.
   */
  onPeerConnectError: (params: PeerConnectErrorDetails) => void;

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
   * Called when a warning occurs during a peer-to-peer connection.
   *
   * @param params - Contains information about the peer warning.
   */
  onPeerWarning: (params: PeerWarningDetails) => void;

  // Positional parameters instead of an object to avoid allocation on every
  // chunk — this is a high-frequency event and allocations increase GC pressure.
  /**
   * Invoked after a chunk of data from a segment has been successfully downloaded.
   *
   * @param bytesLength - The size of the downloaded chunk in bytes.
   * @param downloadSource - The source of the download.
   * @param peerId - The peer ID of the peer that the event is about, if applicable.
   * @param streamType - The type of stream that the chunk belongs to.
   * @param infoHash - The info hash of the swarm that the chunk belongs to.
   */
  onChunkDownloaded: (
    bytesLength: number,
    downloadSource: DownloadSource,
    peerId: string | undefined,
    streamType: StreamType,
    infoHash: string,
  ) => void;

  // Positional parameters instead of an object to avoid allocation on every
  // chunk — this is a high-frequency event and allocations increase GC pressure.
  /**
   * Called when a chunk of data has been successfully uploaded to a peer.
   *
   * @param bytesLength - The length of the segment in bytes.
   * @param peerId - The peer ID, if the segment was downloaded from a peer
   * @param streamType - The type of stream that the chunk belongs to.
   * @param infoHash - The info hash of the swarm that the chunk belongs to.
   */
  onChunkUploaded: (
    bytesLength: number,
    peerId: string,
    streamType: StreamType,
    infoHash: string,
  ) => void;

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
  | "http-unexpected-status-code"
  | "http-segment-validation-failed";

/** Defines the types of errors specific to peer-to-peer requests. */
export type PeerRequestErrorType =
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
> extends TypedError<T> {
  readonly name = "RequestError";

  /** Error timestamp. */
  readonly timestamp: number;

  /**
   * Constructs a new RequestError.
   * @param type - The specific error type.
   * @param message - Optional message describing the error.
   * @param cause - Optional underlying cause of the error.
   */
  constructor(type: T, message?: string, cause?: unknown) {
    super(type, message, cause);
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
export class CoreRequestError extends TypedError<"failed" | "aborted"> {
  readonly name = "CoreRequestError";
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
