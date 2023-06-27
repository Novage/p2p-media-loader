import { SegmentManager } from "./segment-manager";
import Debug from "debug";
import { StreamProtocol } from "../types/types";

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
    this.segmentManager.setManifestUrl(uri);
    const processedStreams = new Set<number>();

    let videoCount = 0;
    let audioCount = 0;
    for (const variant of manifest.variants) {
      const { video, audio } = variant;
      if (video && !processedStreams.has(video.id)) {
        this.hookSegmentIndex(video);
        this.segmentManager.setStream({
          stream: video,
          streamOrder: videoCount,
        });
        processedStreams.add(video.id);
        videoCount++;
      }
      if (audio && !processedStreams.has(audio.id)) {
        this.hookSegmentIndex(audio);
        this.segmentManager.setStream({
          stream: audio,
          streamOrder: audioCount,
        });
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
    return this.originalManifestParser.update();
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
      const result = await createSegmentIndexOriginal.call(stream);
      const { segmentIndex } = stream;
      let prevReference: shaka.media.SegmentReference | null = null;
      let prevFirstItemReference: shaka.media.SegmentReference | null = null;
      let prevLastItemReference: shaka.media.SegmentReference | null = null;
      if (segmentIndex) {
        const getOriginal = segmentIndex.get;
        segmentIndex.get = (segmentNumber) => {
          const reference = getOriginal.call(segmentIndex, segmentNumber);
          if (reference === prevReference) return reference;
          prevReference = reference;

          let firstItemReference: shaka.media.SegmentReference | null = null;
          let lastItemReference: shaka.media.SegmentReference | null = null;
          const currentGet = segmentIndex.get;
          segmentIndex.get = getOriginal;

          let references: shaka.media.SegmentReference[];
          try {
            references = Array.from(segmentIndex);
            firstItemReference = references[0];
            lastItemReference = references[references.length - 1];
          } catch (err) {
            //For situations when segmentIndex is not iterable (inner array length is 0)
            return reference;
          }

          if (
            firstItemReference !== prevFirstItemReference ||
            lastItemReference !== prevLastItemReference
          ) {
            //Segment index have been updated
            this.segmentManager.setStream({
              stream,
              segmentReferences: references,
            });
            this.debug(`Stream ${stream.id} is updated`);
            prevFirstItemReference = firstItemReference;
            prevLastItemReference = lastItemReference;
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
  public constructor(
    segmentManager: SegmentManager,
    setProtocol: (protocol: StreamProtocol) => void
  ) {
    super(new shaka.hls.HlsParser(), segmentManager);
    setProtocol("hls");
  }
}

export class DashManifestParser extends ManifestParserDecorator {
  public constructor(
    segmentsManager: SegmentManager,
    setProtocol: (protocol: StreamProtocol) => void
  ) {
    super(new shaka.dash.DashParser(), segmentsManager);
    setProtocol("dash");
  }
}
