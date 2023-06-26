import { SegmentManager } from "./segment-manager";
import Debug from "debug";
import { StreamInfo } from "../types/types";

export class ManifestParserDecorator implements shaka.extern.ManifestParser {
  private readonly originalManifestParser: shaka.extern.ManifestParser;
  private readonly segmentManager: SegmentManager;
  private readonly debug = Debug("p2pml-shaka:manifest-parser");
  private readonly streamInfo: StreamInfo;

  constructor(
    originalManifestParser: shaka.extern.ManifestParser,
    segmentManager: SegmentManager,
    steamInfo: StreamInfo
  ) {
    console.log(originalManifestParser);
    this.originalManifestParser = originalManifestParser;
    this.segmentManager = segmentManager;
    this.streamInfo = steamInfo;
  }

  configure(config: shaka.extern.ManifestConfiguration) {
    return this.originalManifestParser.configure(config);
  }

  async start(
    uri: string,
    playerInterface: shaka.extern.ManifestParser.PlayerInterface
  ): Promise<shaka.extern.Manifest> {
    const original = playerInterface.modifyManifestRequest;
    playerInterface.modifyManifestRequest = (a, b) => {
      const res = original.call(playerInterface, a, b);

      // console.log("parser");
      // console.log(a);
      return res;
    };
    const manifest = await this.originalManifestParser.start(
      uri,
      playerInterface
    );
    this.segmentManager.setManifestUrl(uri);

    // setInterval(() => {
    //   console.log(
    //     "getPresentationStartTime",
    //     manifest.presentationTimeline.getPresentationStartTime()
    //   );
    //   console.log(manifest.presentationTimeline.getSeekRangeStart());
    //   console.log(manifest.presentationTimeline.getSegmentAvailabilityStart());
    // }, 1000);

    // console.log(playerInterface.modifyManifestRequest);
    const processedStreams = new Set<number>();

    let videoCount = 0;
    let audioCount = 0;
    for (const variant of manifest.variants) {
      const { video, audio } = variant;
      if (video && !processedStreams.has(video.id)) {
        this.hookSegmentIndex(video);
        this.segmentManager.setStream(video, videoCount);
        processedStreams.add(video.id);
        videoCount++;
      }
      if (audio && !processedStreams.has(audio.id)) {
        this.hookSegmentIndex(audio);
        this.segmentManager.setStream(audio, audioCount);
        processedStreams.add(audio.id);
        audioCount++;
      }
    }

    return manifest;
  }

  stop() {
    return this.originalManifestParser.stop();
  }

  async update() {
    const update = await this.originalManifestParser.update();
    console.log(update);
    console.log("UPDATE");
    return update;
  }

  onExpirationUpdated(sessionId: string, expiration: number) {
    return this.originalManifestParser.onExpirationUpdated(
      sessionId,
      expiration
    );
  }

  private hookSegmentIndex(stream: shaka.extern.Stream): void {
    const createSegmentIndexOriginal = stream.createSegmentIndex;
    stream.createSegmentIndex = async () => {
      console.log(`stream ${stream.id} request`);
      const result = await createSegmentIndexOriginal.call(stream);
      const { segmentIndex } = stream;
      let prevReference: shaka.media.SegmentReference | null = null;
      let prevFirstItemReference: shaka.media.SegmentReference | null = null;
      if (segmentIndex) {
        // const updateEveryOriginal = segmentIndex.getIteratorForTime;
        //
        // segmentIndex.evict = (time) => {
        //   const res = updateEveryOriginal.call(segmentIndex, time);
        //
        //   console.log(time);
        //   return res;
        // };

        const getOriginal = segmentIndex.get;
        segmentIndex.get = (segmentNumber) => {
          const reference = getOriginal.call(segmentIndex, segmentNumber);
          if (reference === prevReference) return reference;
          prevReference = reference;

          let firstItemReference: shaka.media.SegmentReference | null = null;
          const currentGet = segmentIndex.get;
          segmentIndex.get = getOriginal;
          try {
            for (const reference of segmentIndex) {
              firstItemReference = reference;
              break;
            }
          } catch (err) {
            //For situations when segmentIndex is not iterable (inner array length is 0)
            return reference;
          }

          if (firstItemReference !== prevFirstItemReference) {
            //Updated playlist was loaded
            console.log(
              `get: ${stream.type} ${stream.id}`,
              this.streamInfo.lastLoadedStreamUrl
            );
            this.segmentManager.setStream(stream, -1);
            this.debug(`Stream ${stream.id} is updated`);
            prevFirstItemReference = firstItemReference;
          }

          segmentIndex.get = currentGet;
          return reference;
        };
      }
      return result;
    };
  }
}

export class HlsManifestParser extends ManifestParserDecorator {
  public constructor(segmentManager: SegmentManager, streamInfo: StreamInfo) {
    super(new shaka.hls.HlsParser(), segmentManager, streamInfo);
    streamInfo.protocol = "hls";
  }
}

export class DashManifestParser extends ManifestParserDecorator {
  public constructor(segmentsManager: SegmentManager, streamInfo: StreamInfo) {
    super(new shaka.dash.DashParser(), segmentsManager, streamInfo);
    streamInfo.protocol = "dash";
  }
}
