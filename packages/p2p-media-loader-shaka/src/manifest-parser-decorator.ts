import { SegmentManager } from "./segment-manager.js";
import {
  HookedStream,
  Shaka,
  HookedNetworkingEngine,
  P2PMLShakaData,
} from "./types.js";
import { StreamType, debug } from "p2p-media-loader-core";

export class ManifestParserDecorator implements shaka.extern.ManifestParser {
  private readonly debug = debug("p2pml-shaka:manifest-parser");
  private readonly isHls: boolean;
  private segmentManager?: SegmentManager;
  private player?: shaka.Player;

  constructor(
    private readonly shaka: Readonly<Shaka>,
    private readonly originalManifestParser: shaka.extern.ManifestParser,
  ) {
    this.isHls = this.originalManifestParser instanceof shaka.hls.HlsParser;
  }

  configure(config: shaka.extern.ManifestConfiguration) {
    return this.originalManifestParser.configure(config) as unknown;
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
    this.player = p2pml.player;
    p2pml.streamInfo.protocol = this.isHls ? "hls" : "dash";
  }

  async start(
    uri: string,
    playerInterface: shaka.extern.ManifestParser.PlayerInterface,
  ): Promise<shaka.extern.Manifest> {
    const { p2pml } =
      playerInterface.networkingEngine as HookedNetworkingEngine;
    this.setP2PMediaLoaderData(p2pml);
    const manifest = await this.originalManifestParser.start(
      uri,
      playerInterface,
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
    return this.originalManifestParser.update() as unknown;
  }

  setMediaElement(mediaElement: HTMLMediaElement | null) {
    return this.originalManifestParser.setMediaElement(mediaElement) as unknown;
  }

  onExpirationUpdated(sessionId: string, expiration: number) {
    return this.originalManifestParser.onExpirationUpdated(
      sessionId,
      expiration,
    ) as unknown;
  }

  private processStreams(variants: shaka.extern.Variant[]) {
    const { segmentManager } = this;
    if (!segmentManager) return;

    const processedStreams = new Set<number>();
    const processStream = (
      stream: shaka.extern.Stream,
      type: StreamType,
      order: number,
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

  private hookSegmentIndex(stream: HookedStream): void {
    const { segmentManager } = this;
    if (!segmentManager) return;

    const substituteSegmentIndexGet = (
      segmentIndex: shaka.media.SegmentIndex,
      callFromCreateSegmentIndexMethod = false,
    ) => {
      let prevReference: shaka.media.SegmentReference | null = null;
      let prevFirstItemReference: shaka.media.SegmentReference;
      let prevLastItemReference: shaka.media.SegmentReference;

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalGet = segmentIndex.get as (
        position: number,
      ) => shaka.media.SegmentReference;
      const customGet = (position: number) => {
        const reference = originalGet.call(segmentIndex, position);
        if (
          reference === prevReference ||
          (!this.player?.isLive() && stream.isSegmentIndexAlreadyRead)
        ) {
          return reference;
        }
        prevReference = reference;

        segmentIndex.get = originalGet;
        try {
          const references = getReferencesArray(
            segmentIndex as unknown as Record<string, unknown>,
            this.shaka,
          );
          if (!references) {
            throw new Error("Segment references not found");
          }

          const firstItemReference = references[0];
          const lastItemReference = references[references.length - 1];

          if (
            firstItemReference === prevFirstItemReference &&
            lastItemReference === prevLastItemReference
          ) {
            return reference;
          }
          prevFirstItemReference = firstItemReference;
          prevLastItemReference = lastItemReference;

          // Segment index have been updated
          segmentManager.updateStreamSegments(stream, references);
          stream.isSegmentIndexAlreadyRead = true;
          this.debug(`Stream ${stream.id} is updated`);
        } catch {
          // Ignore an error when segmentIndex inner array is empty
        } finally {
          // Do not set custom get again if the segment index is already read and the stream is VOD
          if (
            !stream.isSegmentIndexAlreadyRead ||
            !!this.player?.isLive() ||
            !callFromCreateSegmentIndexMethod
          ) {
            segmentIndex.get = customGet;
          }
        }
        return reference;
      };

      segmentIndex.get = customGet;
    };

    if (stream.segmentIndex) {
      substituteSegmentIndexGet(stream.segmentIndex);
      return;
    }

    const createSegmentIndexOriginal = stream.createSegmentIndex;
    stream.createSegmentIndex = async () => {
      const result: unknown = await createSegmentIndexOriginal.call(stream);
      if (stream.segmentIndex) {
        substituteSegmentIndexGet(stream.segmentIndex, true);
      }
      return result;
    };
  }

  private hookHlsStreamMediaSequenceTimeMaps(variants: shaka.extern.Variant[]) {
    const maps = getMapPropertiesFromObject(
      this.originalManifestParser as unknown as Record<string, unknown>,
    );

    // For version 4.3 and above
    let videoMap: Map<number, number> | undefined;
    let audioMap: Map<number, number> | undefined;
    const keysToCheck = ["video", "audio", "text", "image"];
    for (const map of maps) {
      if (!keysToCheck.every((key) => map.has(key))) continue;

      videoMap = map.get("video") as Map<number, number> | undefined;
      audioMap = map.get("audio") as Map<number, number> | undefined;
    }

    if (videoMap && audioMap) {
      for (const variant of variants) {
        const { video: videoStream, audio: audioStream } = variant;
        if (videoStream) {
          (videoStream as HookedStream).mediaSequenceTimeMap = videoMap;
        }
        if (audioStream) {
          (audioStream as HookedStream).mediaSequenceTimeMap = videoMap;
        }
      }
      return;
    }

    // For version 4.2; Retrieving mediaSequence map for each HLS playlist
    const manifestVariantsMap = maps.find((map) => {
      const item = map.values().next().value;

      return (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        typeof item === "object" && (item as any)?.streams?.createSegmentIndex
      );
    });

    if (!manifestVariantsMap) return;

    const manifestVariantMapValues = [...manifestVariantsMap.values()];

    for (const variant of manifestVariantMapValues) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      if ((variant as any)?.stream?.mediaSequenceTimeMap) continue;

      const mediaSequenceTimeMap = getMapPropertiesFromObject(
        variant as Record<string, unknown>,
      ).find((map) => {
        const [key, value] = map.entries().next().value ?? [];
        return typeof key === "number" && typeof value === "number";
      });

      if (!mediaSequenceTimeMap) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (variant as any).stream.mediaSequenceTimeMap =
        mediaSequenceTimeMap as Map<number, number>;
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

function getReferencesArray(
  obj: Record<string, unknown>,
  shaka: Shaka,
): shaka.media.SegmentReference[] | null {
  for (const key in obj) {
    if (
      Array.isArray(obj[key]) &&
      obj[key].length > 0 &&
      obj[key][0] instanceof shaka.media.SegmentReference
    ) {
      return obj[key] as shaka.media.SegmentReference[];
    } else if (typeof obj[key] === "object") {
      const references = getReferencesArray(
        obj[key] as Record<string, unknown>,
        shaka,
      );
      if (references) return references;
    }
  }
  return null;
}

function getMapPropertiesFromObject(object: Record<string, unknown>) {
  return Object.values(object).filter(
    (property): property is Map<unknown, unknown> => property instanceof Map,
  );
}
