import { SegmentResponse, StreamWithSegments } from "./index";
import * as Utils from "./utils";
import { HttpLoader } from "./http-loader";
import { LoadQueue } from "./load-queue";
import { SegmentsMemoryStorage } from "./segments-storage";

export class Loader {
  private manifestResponseUrl?: string;
  private readonly httpLoader = new HttpLoader();

  constructor(
    private readonly streams: Map<string, StreamWithSegments>,
    private readonly mainQueue: LoadQueue,
    private readonly secondaryQueue: LoadQueue,
    private readonly segmentsMemoryStorage: SegmentsMemoryStorage
  ) {}

  setManifestResponseUrl(url: string) {
    this.manifestResponseUrl = url;
  }

  async loadSegment(segmentId: string): Promise<SegmentResponse> {
    const { segment, stream } = this.identifySegment(segmentId);

    const queue = stream.type === "main" ? this.mainQueue : this.secondaryQueue;
    queue.requestByPlayer(segment.localId);
    const request = queue.getRequestById(segment.localId);

    if (!request) {
      throw new Error("No segment found");
    }

    const [response, loadingDuration] = await trackTime(
      () => this.httpLoader.load(request),
      "s"
    );

    const { data, url, ok, status } = response;
    const bits = data.byteLength * 8;

    const bandwidth = bits / loadingDuration;

    return {
      url,
      data,
      bandwidth,
      status,
      ok,
    };
  }

  abortSegment(segmentId: string) {
    this.httpLoader.abort(segmentId);
  }

  private identifySegment(segmentId: string) {
    if (!this.manifestResponseUrl) {
      throw new Error("Manifest response url is undefined");
    }

    const { stream, segment } =
      Utils.getSegmentFromStreamsMap(this.streams, segmentId) ?? {};
    if (!segment || !stream) {
      throw new Error(`Not found segment with id: ${segmentId}`);
    }

    // console.log("\nloading segment:");
    // console.log("Index: ", segment.externalId);
    const streamEternalId = Utils.getStreamExternalId(
      stream,
      this.manifestResponseUrl
    );
    // console.log("Stream: ", streamEternalId);
    // console.log(this.mainQueue.highDemandQueue);
    // // console.log(this.mainQueue.lowDemandQueue);
    // console.log((this.mainQueue as any).playback);

    return { segment, stream };
  }
}

async function trackTime<T>(
  action: () => T,
  unit: "s" | "ms" = "s"
): Promise<[Awaited<T>, number]> {
  const start = performance.now();
  const result = await action();
  const duration = performance.now() - start;
  return [result, unit === "ms" ? duration : duration / 1000];
}
