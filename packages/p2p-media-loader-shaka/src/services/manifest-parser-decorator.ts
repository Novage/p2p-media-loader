import { SegmentManager } from "./segment-manager";
import Debug from "debug";
import { HookedStream, StreamProtocol, Shaka } from "../types/types";

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
    if (this.isHLS) {
      const success = this.retrieveStreamMediaSequenceTimeMaps(
        manifest.variants
      );
      this.retrieveStreamUrls(!success);
    }
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

    const processStream = (
      stream: shaka.extern.Stream | null,
      count: number,
      bandwidth: number
    ) => {
      if (!stream || processedStreams.has(stream.id)) return false;
      if (this.isDash) this.hookSegmentIndex(stream);
      this.segmentManager.setStream({
        stream: stream as HookedStream,
        streamOrder: count,
        bitrate: bandwidth,
      });
      if (stream.segmentIndex) {
        this.segmentManager.updateStream({ stream });
      }
      processedStreams.add(stream.id);
      return true;
    };

    let videoCount = 0;
    let audioCount = 0;
    for (const variant of variants) {
      const { video, audio, bandwidth } = variant;
      if (processStream(video, videoCount, bandwidth)) videoCount++;
      if (processStream(audio, audioCount, bandwidth)) audioCount++;
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
          // For situations when segmentIndex is not iterable (inner array length is 0)
          segmentIndex.get = getOriginal;
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

  private retrieveStreamMediaSequenceTimeMaps(
    variants: shaka.extern.Variant[]
  ) {
    // For version 4.3
    const manifestProperties = Object.values(this.originalManifestParser);
    let videoMap: Map<number, number> | undefined = undefined;
    let audioMap: Map<number, number> | undefined = undefined;

    for (const manifestProp of manifestProperties) {
      if (typeof manifestProp === "object" && manifestProp instanceof Map) {
        const mapKeys = Array.from(manifestProp.keys());
        if (
          ["video", "audio", "text", "image"].every((i) => mapKeys.includes(i))
        ) {
          videoMap = manifestProp.get("video");
          audioMap = manifestProp.get("audio");
          break;
        }
      }
    }

    if (!videoMap && !audioMap) return false;

    for (const variant of variants) {
      const { video: videoStream, audio: audioStream } = variant;
      if (videoStream && videoMap) {
        (videoStream as HookedStream).mediaSequenceTimeMap = videoMap;
      }
      if (audioStream && audioMap) {
        (audioStream as HookedStream).mediaSequenceTimeMap = videoMap;
      }
    }

    return true;
  }

  private retrieveStreamUrls(retrieveMediaSequenceMaps: boolean) {
    const manifestProperties = Object.values(this.originalManifestParser);

    let manifestVariantMapValues: {
      stream: {
        createSegmentIndex: () => void;
        type: string;
        streamUrl?: string;
        mediaSequenceTimeMap?: Map<number, number>;
      };
      [key: string]: unknown;
    }[] = [];
    for (const manifestProp of manifestProperties) {
      if (typeof manifestProp !== "object" || !(manifestProp instanceof Map)) {
        continue;
      }

      manifestVariantMapValues = Array.from(manifestProp.values());
      const [value] = manifestVariantMapValues;
      if (typeof value !== "object" || !value.stream?.createSegmentIndex) {
        continue;
      }
      if (!retrieveMediaSequenceMaps) break;

      // For version 4.2; Retrieving mediaSequence map for each of HLS playlists
      for (const variant of manifestVariantMapValues) {
        const variantProps = Object.values(variant);
        const mediaSequenceTimeMap = variantProps.find((p) => p instanceof Map);
        if (!mediaSequenceTimeMap || variant.stream.mediaSequenceTimeMap) {
          continue;
        }
        variant.stream.mediaSequenceTimeMap = mediaSequenceTimeMap as Map<
          number,
          number
        >;
      }
      break;
    }

    // Retrieve HLS playlists urls
    for (const variant of manifestVariantMapValues) {
      const variantProps = Object.values(variant) as unknown[];
      let streamUrl = "";
      for (const property of variantProps) {
        if (typeof property === "string" && property.startsWith("http")) {
          streamUrl = property;
        }
      }

      variant.stream.streamUrl = streamUrl;
    }
  }
}

export class HlsManifestParser extends ManifestParserDecorator {
  public constructor(
    shaka: Shaka,
    segmentManager: SegmentManager,
    setProtocol: (protocol: StreamProtocol) => void
  ) {
    super(new shaka.hls.HlsParser(), segmentManager, "hls");
    setProtocol("hls");
  }
}

export class DashManifestParser extends ManifestParserDecorator {
  public constructor(
    shaka: Shaka,
    segmentsManager: SegmentManager,
    setProtocol: (protocol: StreamProtocol) => void
  ) {
    super(new shaka.dash.DashParser(), segmentsManager, "dash");
    setProtocol("dash");
  }
}
