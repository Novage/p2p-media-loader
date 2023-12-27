import { SegmentManager } from "./segment-manager";
import Debug from "debug";
import {
  HookedStream,
  Shaka,
  HookedNetworkingEngine,
  P2PMLShakaData,
} from "./types";
import { StreamType } from "p2p-media-loader-core";

export class ManifestParserDecorator implements shaka.extern.ManifestParser {
  private readonly debug = Debug("p2pml-shaka:manifest-parser");
  private readonly isHls: boolean;
  private segmentManager?: SegmentManager;

  constructor(
    shaka: Readonly<Shaka>,
    private readonly originalManifestParser: shaka.extern.ManifestParser
  ) {
    this.isHls = this.originalManifestParser instanceof shaka.hls.HlsParser;
  }

  configure(config: shaka.extern.ManifestConfiguration) {
    return this.originalManifestParser.configure(config);
  }

  banLocation(uri: string): unknown {
    return this.originalManifestParser.banLocation(uri);
  }

  onInitialVariantChosen(variant: shaka.extern.Variant): unknown {
    return this.originalManifestParser.onInitialVariantChosen(variant);
  }

  private setP2PMediaLoaderData(p2pml?: P2PMLShakaData) {
    if (!p2pml) return;
    this.segmentManager = p2pml.segmentManager;
    p2pml.streamInfo.protocol = this.isHls ? "hls" : "dash";
  }

  async start(
    uri: string,
    playerInterface: shaka.extern.ManifestParser.PlayerInterface
  ): Promise<shaka.extern.Manifest> {
    const { p2pml } =
      playerInterface.networkingEngine as HookedNetworkingEngine;
    this.setP2PMediaLoaderData(p2pml);
    const manifest = await this.originalManifestParser.start(
      uri,
      playerInterface
    );
    if (!p2pml) return manifest;

    if (this.isHls) {
      this.hookHlsStreamMediaSequenceTimeMaps(manifest.variants);
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
    const { segmentManager } = this;
    if (!segmentManager) return;

    const processedStreams = new Set<number>();
    const processStream = (
      stream: shaka.extern.Stream,
      type: StreamType,
      order: number
    ) => {
      this.hookSegmentIndex(stream);
      segmentManager.setStream(stream as HookedStream, type, order);
      processedStreams.add(stream.id);
      return true;
    };

    let videoCount = 0;
    let audioCount = 0;
    for (const variant of variants) {
      const { video, audio } = variant;

      if (video && !processedStreams.has(video.id)) {
        processStream(video, "main", videoCount++);
      }
      if (audio && !processedStreams.has(audio.id)) {
        processStream(audio, !video ? "main" : "secondary", audioCount++);
      }
    }
  }

  private hookSegmentIndex(stream: shaka.extern.Stream): void {
    const { segmentManager } = this;
    if (!segmentManager) return;

    const createSegmentIndexOriginal = stream.createSegmentIndex;
    stream.createSegmentIndex = async () => {
      const result = await createSegmentIndexOriginal.call(stream);
      const { segmentIndex } = stream;
      let prevReference: shaka.media.SegmentReference | null = null;
      let prevFirstItemReference: shaka.media.SegmentReference;
      let prevLastItemReference: shaka.media.SegmentReference;

      if (!segmentIndex) return result;
      const segmentReferencesPropName =
        getReferencesListPropertyOfSegmentIndex(segmentIndex);
      if (!segmentReferencesPropName) return result;

      const getOriginal = segmentIndex.get;
      segmentIndex.get = (position) => {
        const reference = getOriginal.call(segmentIndex, position);
        if (reference === prevReference) return reference;
        prevReference = reference;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const referencesList = (segmentIndex as any)[
          segmentReferencesPropName
        ] as shaka.media.SegmentReference[];
        const firstItemReference = referencesList[0];
        const lastItemReference = referencesList[referencesList.length - 1];

        if (
          firstItemReference === prevFirstItemReference &&
          lastItemReference === prevLastItemReference
        ) {
          return reference;
        }

        // Segment index have been updated
        segmentManager.updateStreamSegments(stream, referencesList);
        this.debug(`Stream ${stream.id} is updated`);
        prevFirstItemReference = firstItemReference;
        prevLastItemReference = lastItemReference;
        return reference;
      };
      return result;
    };
  }

  private hookHlsStreamMediaSequenceTimeMaps(variants: shaka.extern.Variant[]) {
    const maps = getMapPropertiesFromObject(this.originalManifestParser);

    // For version 4.3 and above
    let videoMap: Map<number, number> | undefined = undefined;
    let audioMap: Map<number, number> | undefined = undefined;
    const keysToCheck = ["video", "audio", "text", "image"];
    for (const map of maps) {
      if (!keysToCheck.every((key) => map.has(key))) continue;

      videoMap = map.get("video");
      audioMap = map.get("audio");
    }

    if (videoMap && audioMap) {
      for (const variant of variants) {
        const { video: videoStream, audio: audioStream } = variant;
        if (videoStream && videoMap) {
          (videoStream as HookedStream).mediaSequenceTimeMap = videoMap;
        }
        if (audioStream && audioMap) {
          (audioStream as HookedStream).mediaSequenceTimeMap = videoMap;
        }
      }
      return;
    }

    // For version 4.2; Retrieving mediaSequence map for each HLS playlist
    const manifestVariantsMap = maps.find((map) => {
      const item = map.values().next().value;
      return typeof item === "object" && item.streams?.createSegmentIndex;
    });

    if (!manifestVariantsMap) return;

    const manifestVariantMapValues: {
      stream: {
        createSegmentIndex: () => void;
        type: string;
        streamUrl?: string;
        mediaSequenceTimeMap?: Map<number, number>;
      };
      [key: string]: unknown;
    }[] = [...manifestVariantsMap.values()];

    for (const variant of manifestVariantMapValues) {
      if (variant.stream.mediaSequenceTimeMap) continue;

      const mediaSequenceTimeMap = getMapPropertiesFromObject(variant).find(
        (map) => {
          const [key, value] = map.entries().next().value ?? [];
          return typeof key === "number" && typeof value === "number";
        }
      );
      if (!mediaSequenceTimeMap) continue;
      variant.stream.mediaSequenceTimeMap = mediaSequenceTimeMap as Map<
        number,
        number
      >;
    }
  }
}

export class HlsManifestParser extends ManifestParserDecorator {
  public constructor(shaka: Shaka) {
    super(shaka, new shaka.hls.HlsParser());
  }
}

export class DashManifestParser extends ManifestParserDecorator {
  public constructor(shaka: Shaka) {
    super(shaka, new shaka.dash.DashParser());
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMapPropertiesFromObject(object: object): Map<any, any>[] {
  return Object.values(object).filter((property) => property instanceof Map);
}

function getReferencesListPropertyOfSegmentIndex(
  segmentIndex: shaka.media.SegmentIndex
): string | undefined {
  return Object.entries(segmentIndex).find(
    ([, value]) => value instanceof Array
  )?.[0];
}
