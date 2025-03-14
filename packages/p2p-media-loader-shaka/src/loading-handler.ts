import * as Utils from "./stream-utils.js";
import { StreamInfo, Shaka, Stream } from "./types.js";
import {
  Core,
  CoreRequestError,
  SegmentResponse,
  EngineCallbacks,
} from "p2p-media-loader-core";

type LoadingHandlerParams = Parameters<shaka.extern.SchemePlugin>;
type Response = shaka.extern.Response;
type LoadingHandlerResult = shaka.extern.IAbortableOperation<Response>;

export class Loader {
  private loadArgs!: LoadingHandlerParams;

  constructor(
    private readonly shaka: Shaka,
    private readonly core: Core<Stream>,
    readonly streamInfo: StreamInfo,
  ) {}

  private defaultLoad() {
    const fetchPlugin = this.shaka.net.HttpFetchPlugin;
    return fetchPlugin.parse(...this.loadArgs);
  }

  load(...args: LoadingHandlerParams): LoadingHandlerResult {
    this.loadArgs = args;
    const { RequestType } = this.shaka.net.NetworkingEngine;
    const [url, request, requestType] = args;
    if (requestType === RequestType.SEGMENT) {
      return this.loadSegment(url, request);
    }

    const loading = this.defaultLoad() as LoadingHandlerResult;
    if (requestType === RequestType.MANIFEST) {
      void this.handleManifestLoading(loading.promise);
    }
    return loading;
  }

  private async handleManifestLoading(loadingPromise: Promise<Response>) {
    if (!this.streamInfo.manifestResponseUrl) {
      // loading main manifest either HLS or DASH
      const response = await loadingPromise;
      this.setManifestResponseUrl(response.uri);
    }
  }

  private loadSegment(
    segmentUrl: string,
    originalRequest: shaka.extern.Request,
  ): LoadingHandlerResult {
    const byteRangeString = originalRequest.headers.Range;
    const segmentRuntimeId = Utils.getSegmentRuntimeId(
      segmentUrl,
      byteRangeString,
    );
    const isSegmentDownloadableByP2PCore =
      this.core.isSegmentLoadable(segmentRuntimeId);

    if (
      !this.core.hasSegment(segmentRuntimeId) ||
      !isSegmentDownloadableByP2PCore
    ) {
      return this.defaultLoad() as LoadingHandlerResult;
    }

    const loadSegment = async (): Promise<Response> => {
      const { request, callbacks } = getSegmentRequest();
      void this.core.loadSegment(segmentRuntimeId, callbacks);
      try {
        const { data, bandwidth } = await request;
        return {
          data,
          headers: {},
          originalRequest,
          uri: segmentUrl,
          originalUri: segmentUrl,
          timeMs: getLoadingDurationBasedOnBandwidth(
            bandwidth,
            data.byteLength,
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
              this.shaka.util.Error.Code.OPERATION_ABORTED,
            );
          }
        }
        throw error;
      }
    };

    return new this.shaka.util.AbortableOperation(loadSegment(), () => {
      this.core.abortSegmentLoading(segmentRuntimeId);
      return Promise.resolve();
    });
  }

  private setManifestResponseUrl(responseUrl: string) {
    this.streamInfo.manifestResponseUrl = responseUrl;
    this.core.setManifestResponseUrl(responseUrl);
  }
}

function getLoadingDurationBasedOnBandwidth(
  bandwidth: number,
  bytesLoaded: number,
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
