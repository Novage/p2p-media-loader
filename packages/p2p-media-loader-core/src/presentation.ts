import debug from "debug";
import { diagnostics } from "./diagnostics.js";
import type {
  ManifestParser,
  ManifestProtocol,
  ParsedManifest,
} from "./manifest/types.js";
import {
  ClockedManifest,
  type ManifestSource,
} from "./manifest/clocked-manifest.js";
import type { SidxBox } from "./manifest/mp4-sidx.js";
import {
  ManifestRegistry,
  type RegistryStream,
  type RegistryUpdate,
} from "./manifest/registry.js";
import { segmentKey } from "./manifest/url-key.js";
import type {
  ByteRange,
  CoreEventMap,
  ProcessedManifest,
  Stream,
  StreamConfig,
  StreamProperties,
  StreamType,
} from "./types.js";
import type {
  SegmentWithStream,
  StreamDetails,
  StreamWithSegments,
} from "./internal-types.js";
import * as StreamUtils from "./utils/stream.js";
import {
  liveDelayForSegments,
  pickLiveTarget,
  type LiveDelay,
} from "./live-delay.js";
import { SourceNaming } from "./source-naming.js";

/** What a presentation needs from the core it belongs to. */
export type PresentationHooks = {
  /** A stream was registered: the core dispatches `onStreamAdded`. */
  onStreamAdded: CoreEventMap["onStreamAdded"];
  /**
   * A stream failed to register: the core dispatches
   * `onStreamRegistrationError`.
   */
  onStreamRegistrationError: CoreEventMap["onStreamRegistrationError"];
  /** A stream's shared segments changed: the stream loaders follow. */
  onSegmentsChanged(stream: StreamWithSegments): void;
  /** Segments left a stream: the segment storage may drop them. */
  onSegmentsLeft(stream: StreamWithSegments, segmentIds: number[]): void;
};

/**
 * What the source playing consists of: the manifests the player handed over,
 * parsed into the registry, and the streams registered from it, with their
 * identity and the segments they share. It takes in manifests and segment
 * indexes, re-parses a manifest whose segment list follows from the clock,
 * names the source's swarms, and keeps the streams in step with the
 * registry; `Core` serves requests from what it holds. See
 * specs/manifest-registry.md and specs/segment-identity.md.
 */
export class Presentation {
  /** Registered streams, keyed by the manifest-derived stream key. */
  readonly streams = new Map<string, StreamWithSegments>();
  /** Whether the source is live, and where its live window places a player. */
  streamDetails: StreamDetails = {
    isLive: false,
    liveTarget: undefined,
  };
  /** What names the swarms of the source playing. */
  private readonly naming = new SourceNaming();
  /** Stream keys whose registration failed; reported once, then left alone. */
  private readonly failedStreamKeys = new Set<string>();
  private readonly unshareableLogged = new Set<string>();
  private manifestRegistry: ManifestRegistry;
  private readonly logger = debug("p2pml-core:core");
  private readonly manifestLogger = debug("p2pml-core:manifest");
  /**
   * The presentation's manifest when its segment list follows from the
   * clock, parsed again as time passes. It decides when; this parses.
   */
  readonly clockedManifest = new ClockedManifest((source, now) =>
    this.reapplyManifest(source, now),
  );

  /**
   * @param manifestParsers - Kept as given: parsers are capabilities, not
   * tunables, so they stay outside the merged config, are never deep-copied,
   * and are not surfaced by `getConfig()`.
   * @param configs - The stream configs, by reference: a dynamic config
   * update changes them in place.
   */
  constructor(
    private readonly manifestParsers: readonly ManifestParser[],
    private readonly configs: {
      readonly main: StreamConfig;
      readonly secondary: StreamConfig;
    },
    private readonly hooks: PresentationHooks,
  ) {
    this.manifestRegistry = this.createManifestRegistry();
  }

  /** See `Core.processManifest`. */
  processManifest(manifest: {
    url: string;
    requestedUrl?: string;
    data: string | ArrayBuffer | ArrayBufferView;
    protocol?: ManifestProtocol;
  }): ProcessedManifest | undefined {
    const text =
      typeof manifest.data === "string"
        ? manifest.data
        : new TextDecoder().decode(manifest.data);

    const parser = manifest.protocol
      ? this.manifestParsers.find((p) => p.protocol === manifest.protocol)
      : this.manifestParsers.find((p) => p.canParse(text));
    if (!parser) {
      this.manifestLogger("no parser for manifest %s", manifest.url);
      return undefined;
    }

    const { requestedUrl } = manifest;
    const source = {
      parser,
      text,
      url: manifest.url,
      requestedUrl,
      receivedAt: Date.now(),
    };
    const applied = this.applyManifest(source);
    if (!applied) {
      diagnostics?.count("ManifestParse:failed");
      this.clockedManifest.failed(source);
      return undefined;
    }
    diagnostics?.count("ManifestParse:succeed");

    // The first manifest that registers a stream names the swarm unless the
    // integration already did. By what was asked for: every viewer asks for
    // the same URL, and a CDN may answer each of them from a different one.
    // A manifest that registered nothing — an I-frame playlist handed over
    // before its master — is not the presentation's name.
    if (this.manifestRegistry.hasStreams()) {
      this.naming.noteFirstManifest(requestedUrl ?? manifest.url);
    }

    this.syncStreamsFromRegistry();

    this.logRegistryUpdates(manifest.url, applied.updates, applied.ignored);
    return summarize(applied.updates);
  }

  /** See `Core.processSegmentIndex`. */
  processSegmentIndex(index: {
    url: string;
    byteRange?: ByteRange;
    data: ArrayBuffer | ArrayBufferView;
  }): ProcessedManifest | undefined {
    // Reading the index is the protocol tokenizer's job, as reading the
    // manifest is; where the subsegments it describes sit is decided below.
    // Only a protocol with an external index supplies a reader, and only such
    // a protocol leaves a stream awaiting one, so the parser that registered
    // the stream is the parser that reads this.
    let sidx: SidxBox | undefined;
    for (const parser of this.manifestParsers) {
      if (parser.parseSegmentIndex) {
        sidx = parser.parseSegmentIndex(index.data);
        break;
      }
    }

    if (!sidx) {
      this.manifestLogger(
        "no sidx box in the index fetched from %s",
        index.url,
      );
      return undefined;
    }

    const updates = this.manifestRegistry.resolveExternalIndex(
      index.url,
      index.byteRange,
      sidx,
    );
    if (!updates.length) {
      this.manifestLogger("no stream awaits an index at %s", index.url);
      return undefined;
    }

    this.syncStreamsFromRegistry();
    this.logRegistryUpdates(index.url, updates);
    // Every stream, not only the one this index resolved: a presentation whose
    // streams each carry their own index would otherwise be described one
    // stream at a time, and a caller sizing a live window from it would size
    // it from whichever index arrived last.
    return summarize(this.manifestRegistry.describeAll());
  }

  /** See `Core.isSegmentIndex`. */
  isSegmentIndex(url: string, byteRange?: ByteRange): boolean {
    return (
      this.manifestRegistry.streamsAwaitingIndex(url, byteRange).length > 0
    );
  }

  /** See `Core.hasSegment`. */
  hasSegment(url: string, byteRange?: ByteRange): boolean {
    return !!StreamUtils.getSegmentFromStreamsMap(
      this.streams,
      segmentKey(url, byteRange),
    );
  }

  /** See `Core.getStream`. */
  getStream(streamRuntimeId: string): Stream | undefined {
    const stream = this.streams.get(streamRuntimeId);
    return stream && this.toStreamSnapshot(stream);
  }

  /** See `Core.getStreams`. */
  getStreams(): Stream[] {
    return Array.from(this.streams.values(), (stream) =>
      this.toStreamSnapshot(stream),
    );
  }

  /**
   * Whether the registry recognises a key it does not share: an
   * initialization segment, or a segment it passes through. A request for
   * one is no registry miss.
   */
  isRecognised(key: string): boolean {
    return (
      this.manifestRegistry.isInitSegment(key) ||
      this.manifestRegistry.isPassThroughSegment(key)
    );
  }

  /** Names the source by a URL the integration gives. */
  nameBy(url: string): void {
    this.naming.nameBy(url);
  }

  /**
   * Readies this for the next source: the registry, the clocked manifest,
   * the streams, the swarm name and the live state are all forgotten.
   */
  reset(): void {
    this.manifestRegistry = this.createManifestRegistry();
    // The next source names its own time sources and keeps its own list.
    this.clockedManifest.reset();
    this.streams.clear();
    this.failedStreamKeys.clear();
    this.unshareableLogged.clear();
    this.naming.reset();
    this.streamDetails = { isLive: false, liveTarget: undefined };
  }

  /**
   * Parses a manifest on the synchronized clock and applies it to the
   * registry. A manifest whose segment list follows from the clock is kept, to
   * be parsed again as time passes; see `ClockedManifest`.
   *
   * @param now - The moment a clock-based segment list is computed for.
   * @returns The registry's account of the change, or `undefined` when the
   * manifest failed to parse, which leaves the registry as it was.
   */
  private applyManifest(
    source: ManifestSource,
    now = this.clockedManifest.listingTime(),
  ) {
    const { parser, text, url, requestedUrl } = source;
    let parsed: ParsedManifest;
    let applied;
    try {
      parsed = parser.parse(text, url, { now });
      applied = this.manifestRegistry.apply(
        requestedUrl !== undefined && requestedUrl !== url
          ? { ...parsed, requestedUrl }
          : parsed,
        // Only a streamIdBuilder reads the text; without one, the registry
        // need not keep each live MPD that declares new streams.
        this.configs.main.streamIdBuilder ||
          this.configs.secondary.streamIdBuilder
          ? text
          : undefined,
      );
    } catch (error) {
      this.manifestLogger("failed to parse %s: %O", url, error);
      return undefined;
    }
    this.clockedManifest.track(source, parsed.clock);
    return applied;
  }

  /**
   * Parses a kept clock-based manifest again for `now`, as though the player
   * had fetched it again, and brings the streams up to date with it.
   *
   * @returns Whether the parse succeeded.
   */
  private reapplyManifest(source: ManifestSource, now: number): boolean {
    const applied = this.applyManifest(source, now);
    if (!applied) return false;
    this.syncStreamsFromRegistry();
    this.logRegistryUpdates(source.url, applied.updates, applied.ignored);
    return true;
  }

  /**
   * The segment a player's request is for. A miss under a clock-based list is
   * answered with a parse for the present before it counts, where one can list
   * something new; see `ClockedManifest.reparseForMiss`.
   */
  findSegment(key: string): SegmentWithStream | undefined {
    const segment = StreamUtils.getSegmentFromStreamsMap(this.streams, key);
    if (
      segment ||
      this.isRecognised(key) ||
      !this.clockedManifest.reparseForMiss()
    ) {
      return segment;
    }
    return StreamUtils.getSegmentFromStreamsMap(this.streams, key);
  }

  private logRegistryUpdates(
    url: string,
    updates: RegistryUpdate[],
    ignored: string[] = [],
  ): void {
    if (!this.manifestLogger.enabled) return;
    if (ignored.length) {
      // A media playlist is one manifest, so this is the whole story of it.
      // Named by the master as no stream, or told from one by query string
      // alone; the registry does not say which.
      this.manifestLogger(
        "%s — not a stream of this presentation by the master's word; ignored",
        url,
      );
      return;
    }
    const changed = updates.filter((u) => u.added || u.removed);
    this.manifestLogger(
      "%s — %d streams registered, %s",
      url,
      this.streams.size,
      changed.length
        ? changed
            .map((u) => `${u.streamKey}: +${u.added} -${u.removed}`)
            .join(", ")
        : "no segment changes",
    );
  }

  /**
   * Makes the registered streams mirror the manifest registry: registers
   * streams the registry has and `streams` does not, and diffs every stream's
   * segments by URL key. A stream whose registration failed is skipped.
   */
  private syncStreamsFromRegistry(): void {
    let isLive = false;
    const liveStreams: {
      type: StreamType;
      target: LiveDelay | undefined;
    }[] = [];
    for (const registryStream of this.manifestRegistry.getStreams()) {
      if (registryStream.isLive === true) {
        isLive = true;
        liveStreams.push({
          type: registryStream.type,
          target: liveDelayForSegments(
            registryStream.segments.values(),
            registryStream.declaredWindow,
          ),
        });
      }

      let stream = this.streams.get(registryStream.key);
      if (!stream) {
        if (this.failedStreamKeys.has(registryStream.key)) continue;
        stream = this.registerStream(registryStream);
        if (!stream) continue;
      }
      this.syncSegments(stream, registryStream);
    }
    this.streamDetails.isLive = isLive;
    this.streamDetails.liveTarget = pickLiveTarget(liveStreams);
  }

  private syncSegments(
    stream: StreamWithSegments,
    registryStream: RegistryStream,
  ): void {
    let changed = false;
    // What the manifest stopped listing, by identity rather than by key: a key
    // can change under a segment that stays, as when a CDN signs the URLs of
    // every refresh anew, and only a segment gone from the stream has left
    // its window.
    const left = new Set<number>();
    for (const [key, segment] of stream.segments) {
      if (!registryStream.segments.get(key)?.shared) {
        stream.segments.delete(key);
        left.add(segment.externalId);
        changed = true;
      }
    }
    for (const [key, segment] of registryStream.segments) {
      // A segment the segmentFilter keeps off P2P is the player's alone: it
      // is never downloaded, stored or announced, and leaves storage if it
      // was there.
      if (!segment.shared) continue;
      left.delete(segment.externalId);
      if (stream.segments.has(key)) continue;
      stream.segments.set(key, {
        runtimeId: key,
        externalId: segment.externalId,
        url: segment.url,
        byteRange: segment.byteRange,
        startTime: segment.startTime,
        endTime: segment.endTime,
        stream,
      });
      changed = true;
    }
    if (left.size) this.hooks.onSegmentsLeft(stream, [...left]);
    if (!changed) return;
    this.hooks.onSegmentsChanged(stream);
  }

  /**
   * Builds a detached snapshot of a registered stream: its identity and
   * integration-specific fields without the internal segments registry.
   * Everything the core hands out — event payloads and getters — is a
   * snapshot, so consumers can never reach or retain core state.
   */
  private toStreamSnapshot(stream: StreamWithSegments): Stream {
    // The core's own state stays out of the public payload.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { segments, ...snapshot } = stream;
    return snapshot;
  }

  /**
   * Registers a stream the manifest registry produced, computing its identity
   * (`swarmId`, `streamId`, `streamSwarmId`, `infoHash`) exactly once.
   *
   * Never throws: a stream that fails to register (an invalid custom stream
   * ID) stays unknown to the core — its segments load
   * through the player's default path without P2P — and the failure is
   * reported once via the `onStreamRegistrationError` event.
   */
  private registerStream(
    registryStream: RegistryStream,
  ): StreamWithSegments | undefined {
    const properties = Object.freeze({ ...registryStream.properties });
    try {
      const stream = this.addStream(registryStream, properties);
      diagnostics?.count("StreamRegistration:added");
      return stream;
    } catch (error) {
      diagnostics?.count("StreamRegistration:failed");
      this.failedStreamKeys.add(registryStream.key);
      this.logger(
        "failed to register stream %s: %O",
        registryStream.key,
        error,
      );
      this.hooks.onStreamRegistrationError({
        runtimeId: registryStream.key,
        streamType: registryStream.type,
        properties,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return undefined;
    }
  }

  private addStream(
    stream: RegistryStream,
    properties: Readonly<StreamProperties>,
  ): StreamWithSegments {
    const config =
      stream.type === "main" ? this.configs.main : this.configs.secondary;

    const registeredStream: StreamWithSegments = {
      runtimeId: stream.key,
      type: stream.type,
      properties,
      ...this.naming.identify(stream, properties, config),
      segments: new Map<string, SegmentWithStream>(),
    };

    this.streams.set(stream.key, registeredStream);

    this.hooks.onStreamAdded({
      stream: this.toStreamSnapshot(registeredStream),
    });
    return registeredStream;
  }

  /**
   * A stream no manifest identified carries the stream ID every unidentified
   * stream of its type carries — its type alone, `main` — so it is the same
   * swarm for all of them. That is right for a media playlist loaded on its
   * own, which is the whole stream: every viewer of that URL plays the same
   * bytes. It is wrong as soon as another stream of that type is registered
   * in the same swarm, which means a rendition whose media playlist the
   * registry could not match to the master that named it — a CDN that signs
   * its playlist URLs per response is enough. Peers would then exchange
   * segments of different renditions by number, so it is not shared.
   */
  isShareable(stream: StreamWithSegments): boolean {
    if (
      this.manifestRegistry.getStream(stream.runtimeId)?.identified !== false
    ) {
      return true;
    }

    for (const other of this.streams.values()) {
      if (other === stream) continue;
      if (other.type !== stream.type || other.swarmId !== stream.swarmId) {
        continue;
      }
      if (!this.unshareableLogged.has(stream.runtimeId)) {
        this.unshareableLogged.add(stream.runtimeId);
        this.logger(
          "no manifest identified %s and it is not the only %s stream of its swarm; it loads without P2P",
          stream.runtimeId,
          stream.type,
        );
      }
      return false;
    }
    return true;
  }

  /**
   * A registry that asks each stream type's `segmentFilter` whether a
   * segment is shared; with no filter configured, a registry that asks
   * nothing. `segmentFilter` cannot change at runtime.
   */
  private createManifestRegistry(): ManifestRegistry {
    const main = this.configs.main.segmentFilter;
    const secondary = this.configs.secondary.segmentFilter;
    if (!main && !secondary) return new ManifestRegistry();
    return new ManifestRegistry((context) => {
      const filter = context.streamType === "main" ? main : secondary;
      return filter ? filter(context) : true;
    });
  }
}

function summarize(updates: readonly RegistryUpdate[]): ProcessedManifest {
  return {
    streams: updates.map((u) => ({
      key: u.streamKey,
      type: u.type,
      isLive: u.isLive,
      start: u.start,
      end: u.end,
      segmentCount: u.segmentCount,
      ...(u.declaredWindow === undefined
        ? {}
        : { declaredWindow: u.declaredWindow }),
    })),
  };
}
