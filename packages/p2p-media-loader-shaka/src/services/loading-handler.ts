import * as Utils from "./segment";
import { SegmentManager } from "./segment-manager";
import { StreamInfo } from "../types/types";
import { Shaka, Stream } from "../types/types";
import { Core } from "p2p-media-loader-core";

interface LoadingHandlerInterface {
  handleLoading: shaka.extern.SchemePlugin;
}

type LoadingHandlerParams = Parameters<shaka.extern.SchemePlugin>;
type Response = shaka.extern.Response;
type LoadingHandlerResult = shaka.extern.IAbortableOperation<Response>;

export class LoadingHandler implements LoadingHandlerInterface {
  private readonly shaka: Shaka;
  private readonly segmentManager: SegmentManager;
  private readonly core: Core<Stream>;
  readonly streamInfo: StreamInfo;
  private loadArgs!: LoadingHandlerParams;

  constructor({
    shaka,
    streamInfo,
    core,
    segmentManager,
  }: {
    shaka: Shaka;
    streamInfo: StreamInfo;
    core: Core<Stream>;
    segmentManager: SegmentManager;
  }) {
    this.shaka = shaka;
    this.streamInfo = streamInfo;
    this.core = core;
    this.segmentManager = segmentManager;
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
    if (!this.core.getStreamByUrl(streamUrl)) return;
    await loadingPromise;
    // Waiting for the playlist to be parsed
    setTimeout(() => this.segmentManager.updateHlsStreamByUrl(streamUrl), 0);
  }

  private handleSegmentLoading(
    segmentUrl: string,
    byteRangeString: string
  ): LoadingHandlerResult {
    const segmentId = Utils.getSegmentLocalId(segmentUrl, byteRangeString);
    if (!this.core.hasSegment(segmentId)) return this.defaultLoad();

    const loadSegment = async (): Promise<Response> => {
      const response = await this.core.loadSegment(segmentId);

      const { data, status, url } = response!;
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
    };

    return new this.shaka.util.AbortableOperation(loadSegment(), async () =>
      this.core.abortSegmentLoading(segmentId)
    );
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
