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

export type DynamicCoreConfig = Partial<
  Pick<
    CoreConfig,
    | "httpDownloadTimeWindow"
    | "p2pDownloadTimeWindow"
    | "p2pNotReceivingBytesTimeoutMs"
    | "httpNotReceivingBytesTimeoutMs"
  >
>;

export type CoreConfig = {
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
  announceTrackers?: string[];
  rtcConfig?: RTCConfiguration;
  trackerClientId?: string;
  validateP2PSegment?: (url: string, byteRange?: ByteRange) => Promise<boolean>;
  httpRequestSetup?: (
    segmentUrl: string,
    segmentByteRange: ByteRange | undefined,
    requestAbortSignal: AbortSignal,
    requestByteRange: { start: number; end?: number } | undefined,
  ) => Promise<Request | undefined | null>;
};

export type DownloadSource = "http" | "p2p";

/**
 * Represents details about a segment event, including the segment itself, the source of download, and an optional peer ID.
 * @param {Segment} segment - The segment that the event is about.
 * @param {DownloadSource} downloadSource - The source of the download.
 * @param {string | undefined} peerId - The peer ID of the peer that the event is about, if applicable.
 */
export interface SegmentEventDetails {
  segment: Segment;
  downloadSource: DownloadSource;
  peerId: string | undefined;
}

/**
 * Represents details about a segment error event with an error property to provide details about a segment download error.
 * @param {RequestError} error - The error that occurred during the segment download.
 * @param {Segment} segment - The segment that the event is about.
 * @param {DownloadSource} downloadSource - The source of the download.
 * @param {string | undefined} peerId - The peer ID of the peer that the event is about, if applicable.
 */
export interface SegmentErrorDetails {
  error: RequestError;
  segment: Segment;
  downloadSource: DownloadSource;
  peerId: string | undefined;
}

/**
 * Represents details about a segment abort event, including the segment, the source of download, and an optional peer ID.
 * @param {Segment} segment - The segment that the event is about.
 * @param {DownloadSource | undefined} downloadSource - The source of the download.
 * @param {string | undefined} peerId - The peer ID of the peer that the event is about, if applicable.
 */
export interface SegmentAbortDetails {
  segment: Segment;
  downloadSource: DownloadSource | undefined;
  peerId: string | undefined;
}

/**
 * Represents the details about a loaded segment, including the length in bytes and the source of the download.
 * @param {number} bytesLength - The length of the segment in bytes.
 * @param {DownloadSource} downloadSource - The source of the download.
 */
export interface SegmentLoadDetails {
  bytesLength: number;
  downloadSource: DownloadSource;
  peerId: string | undefined;
}

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
   * @param {SegmentEventDetails} params - Provides details about the segment being downloaded.
   */
  onSegmentStart: (params: SegmentEventDetails) => void;
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
