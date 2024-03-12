import { BandwidthCalculator } from "./bandwidth-calculator";

export type StreamType = "main" | "secondary";

export type ByteRange = { start: number; end: number };

export type SegmentBase = {
  readonly localId: string;
  readonly externalId: number;
  readonly url: string;
  readonly byteRange?: ByteRange;
  readonly startTime: number;
  readonly endTime: number;
};

export type Segment = SegmentBase & {
  readonly stream: StreamWithSegments;
};

export type Stream = {
  readonly localId: string;
  readonly type: StreamType;
  readonly index: number;
};

export type StreamWithSegments<
  TStream extends Stream = Stream,
  TMap extends ReadonlyMap<string, SegmentBase> = Map<string, Segment>,
> = TStream & {
  readonly segments: TMap;
};

export type StreamWithReadonlySegments<TStream extends Stream = Stream> =
  StreamWithSegments<TStream, ReadonlyMap<string, SegmentBase>>;

export type SegmentResponse = {
  data: ArrayBuffer;
  bandwidth: number;
};

export type Settings = {
  highDemandTimeWindow: number;
  httpDownloadTimeWindow: number;
  p2pDownloadTimeWindow: number;
  simultaneousHttpDownloads: number;
  simultaneousP2PDownloads: number;
  cachedSegmentExpiration: number;
  cachedSegmentsCount: number;
  webRtcMaxMessageSize: number;
  p2pNotReceivingBytesTimeoutMs: number;
  p2pLoaderDestroyTimeoutMs: number;
  httpNotReceivingBytesTimeoutMs: number;
  httpErrorRetries: number;
  p2pErrorRetries: number;
  validateP2PSegment?: (url: string, byteRange?: ByteRange) => Promise<boolean>;
  httpRequestSetup?: (
    segmentUrl: string,
    segmentByteRange: ByteRange | undefined,
    requestAbortSignal: AbortSignal,
    requestByteRange: { start: number; end?: number } | undefined,
  ) => Promise<Request | undefined | null>;
};

/**
 * Represents details about a segment event, including the segment itself, the source of download, and an optional peer ID.
 * @param {Segment} segment - The segment that the event is about.
 * @param {"p2p" | "http"} downloadSource - The source of the download, either "p2p" or "http".
 * @param {string | undefined} peerId - The peer ID of the peer that the event is about, if applicable.
 */
export interface SegmentEventDetails {
  segment: Segment;
  downloadSource: "p2p" | "http";
  peerId: string | undefined;
}

/**
 * Represents details about a segment error event with an error property to provide details about a segment download error.
 * @param {RequestError} error - The error that occurred during the segment download.
 * @param {Segment} segment - The segment that the event is about.
 * @param {"p2p" | "http"} downloadSource - The source of the download, either "p2p" or "http".
 * @param {string | undefined} peerId - The peer ID of the peer that the event is about, if applicable.
 */
export interface SegmentErrorDetails extends SegmentEventDetails {
  error: RequestError;
}

/**
 * Represents details about a segment abort event, including the segment, the source of download, and an optional peer ID.
 * @param {Segment} segment - The segment that the event is about.
 * @param {"p2p" | "http"} downloadSource - The source of the download: "p2p" | "http" | undefined.
 * @param {string | undefined} peerId - The peer ID of the peer that the event is about, if applicable.
 */
export interface SegmentAbortDetails
  extends Pick<SegmentEventDetails, "segment" | "peerId"> {
  downloadSource: "p2p" | "http" | undefined;
}

/**
 * Represents the details about a loaded segment, including the length in bytes and the source of the download.
 * @param {number} bytesLength - The length of the segment in bytes.
 * @param {"p2p" | "http"} downloadSource - The source of the download, either "p2p" or "http".
 */
export interface SegmentLoadDetails {
  bytesLength: number;
  downloadSource: "p2p" | "http";
}

/**
 * The CoreEventMap defines a comprehensive suite of event handlers crucial for monitoring and controlling the lifecycle
 * of segment downloading and uploading processes in a peer-to-peer (P2P) or HTTP-based content distribution system. Each
 * handler corresponds to specific events that signify important milestones or states in the download/upload process,
 * as well as the dynamics of peer connectivity, providing applications the ability to respond and adapt to these moments
 * efficiently.
 *
 * Through these event handlers, applications can manage network resources, enhance user experiences, and ensure data
 * integrity and performance across varied network conditions. Implementing these handlers facilitates a reactive,
 * adaptive system capable of optimizing content distribution and acquisition in a decentralized network environment.
 */

export type CoreEventMap = {
  /**
   * Invoked when a segment is fully downloaded and available for use. This event is critical for tracking successful
   * downloads, managing resource allocation, or updating application state to reflect the new data availability.
   *
   * @param {SegmentLoadDetails} params - Contains information about the loaded segment, including its size in bytes
   * and the download source, distinguishing between peer-to-peer ("p2p") and HTTP sources.
   */
  onSegmentLoaded: (params: SegmentLoadDetails) => void;
  /**
   * Triggered when an error occurs during the download of a segment. Use this handler to implement error recovery
   * mechanisms, log diagnostic information, or notify users of download failures. The included error details can
   * provide insight into the nature of the failure.
   *
   * @param {SegmentErrorDetails} params - Includes the segment information, the source of the download, and the specific
   * error that occurred, facilitating a comprehensive response to the issue.
   */
  onSegmentError: (params: SegmentErrorDetails) => void;
  /**
   * Called if the download of a segment is aborted before completion. This can happen due to network issues, user
   * actions, or other external factors. Handling this event allows for cleanup operations, retry logic, or user
   * notifications about the interrupted process.
   *
   * @param {SegmentAbortDetails} params - Contains information about the aborted segment and the condition of the download
   * source at the time of abortion, which might be undefined if the source is not determinable.
   */
  onSegmentAbort: (params: SegmentAbortDetails) => void;
  /**
   * Fired at the beginning of a segment download process. This is an opportunity to perform setup tasks, such as
   * displaying download indicators, initiating resource allocation, or logging the start of a download operation.
   *
   * @param {SegmentEventDetails} params - Provides details about the segment being downloaded and the chosen download
   * source, offering context for the initiation of the download process.
   */
  onSegmentStart: (params: SegmentEventDetails) => void;
  /**
   * Occurs when a new peer-to-peer connection is established. This event can be used to manage the pool of available
   * peers, update UI elements to reflect the number of connected peers, or log connections for debugging purposes.
   *
   * @param {string} peerId - The unique identifier of the peer that has just connected, allowing for identification and
   * further interaction with this peer.
   */
  onPeerConnect: (peerId: string) => void;
  /**
   * Triggered when an existing peer-to-peer connection is closed. This event is crucial for maintaining an accurate
   * representation of the current peer pool, freeing up resources allocated to the peer, or updating the UI to reflect
   * the change in the number of active connections.
   *
   * @param {string} peerId - The unique identifier of the peer whose connection has been closed, providing a clear
   * reference to the affected connection.
   */
  onPeerClose: (peerId: string) => void;
  /**
   * Invoked after a chunk of data from a segment has been successfully downloaded. This granular event is useful for
   * monitoring download progress, implementing chunk-based data processing, or adjusting download strategies based on
   * the source of the chunk.
   *
   * @param {number} bytesLength - The size of the downloaded chunk in bytes, offering a measure of the download progress.
   * @param {"http" | "p2p"} type - Indicates whether the chunk was downloaded via HTTP or peer-to-peer, which can inform
   * decisions about network usage or peer selection.
   * @param {string} [peerId] - Optionally identifies the peer from which the chunk was downloaded, relevant for p2p downloads.
   */
  onChunkDownloaded: (
    bytesLength: number,
    type: "http" | "p2p",
    peerId?: string,
  ) => void;

  /**
   * Called when a chunk of data has been successfully uploaded to a peer. This event supports the implementation of
   * upload tracking, resource management for upload capacity, or rewarding mechanisms for contributing bandwidth.
   *
   * @param {number} bytesLength - The size of the uploaded chunk in bytes, useful for tracking upload volume or managing
   * bandwidth allocation.
   * @param {string} peerId - Identifies the peer to which the chunk was uploaded, enabling detailed tracking and
   * management of peer interactions.
   */
  onChunkUploaded: (bytesLength: number, peerId: string) => void;
};

export type Playback = {
  position: number;
  rate: number;
};

export type BandwidthCalculators = Readonly<{
  all: BandwidthCalculator;
  http: BandwidthCalculator;
}>;

export type StreamDetails = {
  isLive: boolean;
  activeLevelBitrate: number;
};

export type RequestInnerErrorType = "abort" | "bytes-receiving-timeout";

export type HttpRequestErrorType =
  | "http-error"
  | "http-bytes-mismatch"
  | "http-unexpected-status-code";

export type PeerRequestErrorType =
  | "peer-response-bytes-length-mismatch"
  | "peer-protocol-violation"
  | "peer-segment-absent"
  | "peer-closed"
  | "p2p-segment-validation-failed";

export type RequestErrorType =
  | RequestInnerErrorType
  | PeerRequestErrorType
  | HttpRequestErrorType;

export class RequestError<
  T extends RequestErrorType = RequestErrorType,
> extends Error {
  readonly timestamp: number;

  constructor(
    readonly type: T,
    message?: string,
  ) {
    super(message);
    this.timestamp = performance.now();
  }
}
