import { Segment } from "./segment";
import { SegmentManager } from "./segment-manager";
import { StreamInfo } from "../types/types";
import Debug from "debug";
import { Shaka } from "../types/types";

interface LoadingHandlerInterface {
  handleLoading: shaka.extern.SchemePlugin;
}

type LoadingHandlerParams = Parameters<shaka.extern.SchemePlugin>;
type Response = shaka.extern.Response;
type LoadingHandlerResult = shaka.extern.IAbortableOperation<Response>;

export class LoadingHandler implements LoadingHandlerInterface {
  private readonly shaka: Shaka;
  private readonly segmentManager: SegmentManager;
  private readonly streamInfo: StreamInfo;
  private loadArgs!: LoadingHandlerParams;
  private readonly abortController = new AbortController();
  private readonly debug = Debug("shaka:loading");

  constructor({
    shaka,
    streamInfo,
    segmentManager,
  }: {
    shaka: Shaka;
    segmentManager: SegmentManager;
    streamInfo: StreamInfo;
  }) {
    this.shaka = shaka;
    this.segmentManager = segmentManager;
    this.streamInfo = streamInfo;
  }

  private defaultLoad() {
    const fetchPlugin = this.shaka.net.HttpFetchPlugin;
    return fetchPlugin.parse(...this.loadArgs);
  }

  handleLoading(...args: LoadingHandlerParams): LoadingHandlerResult {
    this.loadArgs = args;
    const { RequestType } = this.shaka.net.NetworkingEngine;
    const [url, request, requestType] = args;
    if (requestType === RequestType.SEGMENT) {
      return this.handleSegmentLoading(url, request.headers.Range);
    }

    const loading = this.defaultLoad();
    if (
      requestType === RequestType.MANIFEST &&
      this.streamInfo.protocol === "hls"
    ) {
      void this.handleStreamLoading(url, loading.promise);
    }
    return loading;
  }

  private async handleStreamLoading(
    streamUrl: string,
    loadingPromise: Promise<unknown>
  ) {
    if (!this.segmentManager.urlStreamMap.has(streamUrl)) return;
    await loadingPromise;
    // Waiting for the playlist to be parsed
    setTimeout(() => this.segmentManager.updateHlsStreamByUrl(streamUrl), 0);
  }

  private handleSegmentLoading(
    segmentUrl: string,
    byteRangeString: string
  ): LoadingHandlerResult {
    const segmentId = Segment.getLocalId(segmentUrl, byteRangeString);
    const stream = this.segmentManager.getStreamBySegmentLocalId(segmentId);
    const segment = stream?.segments.get(segmentId);
    this.debug(`\n\nLoading segment with id: ${segmentId}`);
    this.debug(`Stream id: ${stream?.id}`);
    this.debug(`Segment: ${segment?.index}`);
    if (!stream) return this.defaultLoad();

    return new this.shaka.util.AbortableOperation(
      this.fetchSegment(segmentUrl, byteRangeString),
      async () => this.abortController.abort()
    );
  }

  private async fetchSegment(
    segmentUrl: string,
    byteRangeString?: string
  ): Promise<Response> {
    const headers = new Headers();

    if (byteRangeString) headers.set("Range", byteRangeString);
    const response = await fetch(segmentUrl, {
      headers,
      signal: this.abortController.signal,
    });
    const data = await response.arrayBuffer();
    const { status, url } = response;

    return {
      data,
      headers: {},
      status,
      uri: url,
      originalUri: segmentUrl,
      timeMs: getLoadingDurationBasedOnBitrate({
        bitrate: 2749539,
        bytesLoaded: data.byteLength,
      }),
    };
  }
}

function getLoadingDurationBasedOnBitrate({
  bitrate,
  bytesLoaded,
}: {
  bitrate: number;
  bytesLoaded: number;
}) {
  const bites = bytesLoaded * 8;
  const targetBandwidth = Math.round(bitrate * 1.1);
  return Math.round(bites / targetBandwidth) * 1000;
}
