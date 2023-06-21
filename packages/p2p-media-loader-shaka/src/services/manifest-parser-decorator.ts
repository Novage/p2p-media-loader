import { SegmentManager } from "./segment-manager";
import Debug from "debug";

export class ManifestParserDecorator implements shaka.extern.ManifestParser {
  private readonly originalManifestParser: shaka.extern.ManifestParser;
  private readonly segmentManager: SegmentManager;
  private readonly debug = Debug("p2pml-shaka:manifest-parser");

  constructor(
    originalManifestParser: shaka.extern.ManifestParser,
    segmentManager: SegmentManager
  ) {
    this.originalManifestParser = originalManifestParser;
    this.segmentManager = segmentManager;
  }

  configure(config: shaka.extern.ManifestConfiguration) {
    return this.originalManifestParser.configure(config);
  }

  async start(
    uri: string,
    playerInterface: shaka.extern.ManifestParser.PlayerInterface
  ): Promise<shaka.extern.Manifest> {
    const manifest = await this.originalManifestParser.start(
      uri,
      playerInterface
    );

    const processedStreams = new Set<number>();

    for (const variant of manifest.variants) {
      const { video, audio } = variant;
      if (video && !processedStreams.has(video.id)) {
        this.hookSegmentIndex(video);
        void this.retrieveSegments(video);
        processedStreams.add(video.id);
      }
      if (audio && !processedStreams.has(audio.id)) {
        this.hookSegmentIndex(audio);
        void this.retrieveSegments(audio);
        processedStreams.add(audio.id);
      }
    }

    return manifest;
  }

  stop() {
    return this.originalManifestParser.stop();
  }

  update() {
    return this.originalManifestParser.update();
  }

  onExpirationUpdated(sessionId: string, expiration: number) {
    return this.originalManifestParser.onExpirationUpdated(
      sessionId,
      expiration
    );
  }

  private async retrieveSegments(stream: shaka.extern.Stream) {
    this.segmentManager.setStream(stream);
  }

  private hookSegmentIndex(stream: shaka.extern.Stream): void {
    const createSegmentIndexOriginal = stream.createSegmentIndex;
    stream.createSegmentIndex = async () => {
      const result = await createSegmentIndexOriginal.call(stream);
      const { segmentIndex } = stream;
      let prevReference: shaka.media.SegmentReference | null = null;
      let prevFirstItemReference: shaka.media.SegmentReference | null = null;
      if (segmentIndex) {
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
            this.segmentManager.setStream(stream);
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
  public constructor(segmentManager: SegmentManager) {
    super(new shaka.hls.HlsParser(), segmentManager);
  }
}

export class DashManifestParser extends ManifestParserDecorator {
  public constructor(segmentsManager: SegmentManager) {
    super(new shaka.hls.HlsParser(), segmentsManager);
  }
}
