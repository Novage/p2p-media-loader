import { SegmentManager } from "./segment-manager";
import Debug from "debug";
import { HookedStream, StreamProtocol } from "../types/types";

export class ManifestParserDecorator implements shaka.extern.ManifestParser {
  private readonly originalManifestParser: shaka.extern.ManifestParser;
  private readonly segmentManager: SegmentManager;
  private readonly debug = Debug("p2pml-shaka:manifest-parser");
  private readonly isHLS: boolean;
  private readonly isDash: boolean;

  constructor(
    originalManifestParser: shaka.extern.ManifestParser,
    segmentManager: SegmentManager,
    protocol: StreamProtocol
  ) {
    this.originalManifestParser = originalManifestParser;
    this.segmentManager = segmentManager;

    this.isHLS = protocol === "hls";
    this.isDash = protocol === "dash";

    if (this.isHLS) {
      const { video, audio } = this.getStreamMediaSequenceTimeMaps();
      this.segmentManager.mediaSequenceTimeMap.video = video;
      this.segmentManager.mediaSequenceTimeMap.audio = audio;
    }
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
    if (this.isHLS) this.hookStreamUrls();
    this.processStreams(manifest.variants);

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

  private processStreams(variants: shaka.extern.Variant[]) {
    const processedStreams = new Set<number>();
    let videoCount = 0;
    let audioCount = 0;
    for (const variant of variants) {
      const { video, audio } = variant;
      if (video && !processedStreams.has(video.id)) {
        if (this.isDash) this.hookSegmentIndex(video);
        this.segmentManager.setStream({
          stream: video as HookedStream,
          streamOrder: videoCount,
        });
        processedStreams.add(video.id);
        videoCount++;
      }
      if (audio && !processedStreams.has(audio.id)) {
        if (this.isDash) this.hookSegmentIndex(audio);
        this.segmentManager.setStream({
          stream: audio,
          streamOrder: audioCount,
        });
        processedStreams.add(audio.id);
        audioCount++;
      }
    }
  }

  private hookSegmentIndex(stream: shaka.extern.Stream): void {
    const createSegmentIndexOriginal = stream.createSegmentIndex;
    stream.createSegmentIndex = async () => {
      const result = await createSegmentIndexOriginal.call(stream);
      const { segmentIndex } = stream;
      let prevReference: shaka.media.SegmentReference | null = null;
      let prevFirstItemReference: shaka.media.SegmentReference | null = null;
      let prevLastItemReference: shaka.media.SegmentReference | null = null;

      if (!segmentIndex) return result;

      const getOriginal = segmentIndex.get;
      segmentIndex.get = (position) => {
        const reference = getOriginal.call(segmentIndex, position);
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
          // Segment index have been updated
          this.segmentManager.updateStream({
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
      return result;
    };
  }

  private getStreamMediaSequenceTimeMaps() {
    const properties = Object.values(this.originalManifestParser);
    let video: Map<number, number> = new Map();
    let audio: Map<number, number> = new Map();

    for (const property of properties) {
      if (typeof property === "object" && property instanceof Map) {
        const keys = Array.from(property.keys());
        if (
          ["video", "audio", "text", "image"].every((i) => keys.includes(i))
        ) {
          video = property.get("video");
          audio = property.get("audio");
          break;
        }
      }
    }

    return { video, audio };
  }

  private hookStreamUrls() {
    const properties = Object.values(this.originalManifestParser);

    let objects: {
      type: string;
      stream: { createSegmentIndex: () => void; streamUrl?: string };
    }[] = [];
    for (const property of properties) {
      if (typeof property === "object" && property instanceof Map) {
        objects = Array.from(property.values());
        const [object] = objects;
        if (
          typeof object === "object" &&
          typeof object.type === "string" &&
          !!object.stream?.createSegmentIndex
        ) {
          break;
        }
      }
    }

    for (const obj of objects) {
      const stream = obj.stream;
      const properties = Object.values(obj);
      let streamUrl = "";
      for (const property of properties) {
        if (typeof property === "string" && property.startsWith("http")) {
          streamUrl = property;
        }
      }

      stream.streamUrl = streamUrl;
    }
  }
}

export class HlsManifestParser extends ManifestParserDecorator {
  public constructor(
    segmentManager: SegmentManager,
    setProtocol: (protocol: StreamProtocol) => void
  ) {
    super(new shaka.hls.HlsParser(), segmentManager, "hls");
    setProtocol("hls");
  }
}

export class DashManifestParser extends ManifestParserDecorator {
  public constructor(
    segmentsManager: SegmentManager,
    setProtocol: (protocol: StreamProtocol) => void
  ) {
    super(new shaka.dash.DashParser(), segmentsManager, "dash");
    setProtocol("dash");
  }
}
