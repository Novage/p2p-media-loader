import * as Utils from "./stream-utils";
import { SegmentManager } from "./segment-manager";
import { StreamInfo } from "./types";
import { Shaka, Stream } from "./types";
import {
  Core,
  CoreRequestError,
  SegmentResponse,
  EngineCallbacks,
} from "p2p-media-loader-core";

interface LoadingHandlerInterface {
  handleLoading: shaka.extern.SchemePlugin;
}

type LoadingHandlerParams = Parameters<shaka.extern.SchemePlugin>;
type Response = shaka.extern.Response;
type LoadingHandlerResult = shaka.extern.IAbortableOperation<Response>;

export class LoadingHandler implements LoadingHandlerInterface {
  private loadArgs!: LoadingHandlerParams;

  constructor(
    private readonly shaka: Shaka,
    private readonly core: Core<Stream>,
    readonly streamInfo: StreamInfo,
    private readonly segmentManager: SegmentManager
  ) {}

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
    if (requestType === RequestType.MANIFEST) {
      void this.handleManifestLoading(url, loading.promise);
    }
    return loading;
  }

  private async handleManifestLoading(
    streamUrl: string,
    loadingPromise: Promise<Response>
  ) {
    if (
      this.streamInfo.protocol === "hls" &&
      !!this.core.getStream(streamUrl)
    ) {
      // loading HLS playlist manifest
      await loadingPromise;
      // Waiting for the playlist to be parsed
      setTimeout(() => this.segmentManager.updateStreamSegments(streamUrl), 0);
    } else if (!this.streamInfo.manifestResponseUrl) {
      // loading master manifest either HLS or DASH
      const response = await loadingPromise;
      this.setManifestResponseUrl(response.uri);
    }
  }

  private handleSegmentLoading(
    segmentUrl: string,
    byteRangeString: string
  ): LoadingHandlerResult {
    const segmentId = Utils.getSegmentLocalId(segmentUrl, byteRangeString);
    if (!this.core.hasSegment(segmentId)) return this.defaultLoad();

    const loadSegment = async (): Promise<Response> => {
      const { request, callbacks } = getSegmentRequest();
      void this.core.loadSegment(segmentId, callbacks);
      try {
        const { data, bandwidth } = await request;
        return {
          data,
          headers: {},
          uri: segmentUrl,
          originalUri: segmentUrl,
          timeMs: getLoadingDurationBasedOnBandwidth(
            bandwidth,
            data.byteLength
          ),
        };
      } catch (error) {
        // TODO: throw Shaka Errors
        if (error instanceof CoreRequestError) {
          const { Error: ShakaError } = this.shaka.util;
          if (error.type === "aborted") {
            throw new ShakaError(
              ShakaError.Severity.RECOVERABLE,
              ShakaError.Category.NETWORK,
              this.shaka.util.Error.Code.OPERATION_ABORTED
            );
          }
        }
        throw error;
      }
    };

    return new this.shaka.util.AbortableOperation(loadSegment(), async () =>
      this.core.abortSegmentLoading(segmentId)
    );
  }

  private setManifestResponseUrl(responseUrl: string) {
    this.streamInfo.manifestResponseUrl = responseUrl;
    this.core.setManifestResponseUrl(responseUrl);
  }
}

function getLoadingDurationBasedOnBandwidth(
  bandwidth: number,
  bytesLoaded: number
) {
  const bits = bytesLoaded * 8;
  return Math.round(bits / bandwidth) * 1000;
}

function getSegmentRequest(): {
  callbacks: EngineCallbacks;
  request: Promise<SegmentResponse>;
} {
  let onSuccess: (value: SegmentResponse) => void;
  let onError: (reason?: unknown) => void;
  const request = new Promise<SegmentResponse>((resolve, reject) => {
    onSuccess = resolve;
    onError = reject;
  });

  return {
    request,
    callbacks: {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      onSuccess: onSuccess!,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      onError: onError!,
    },
  };
}
