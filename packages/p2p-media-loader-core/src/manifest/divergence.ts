import type { StreamProperties, StreamType } from "../types.js";
import type { StreamWithSegments } from "../internal-types.js";
import type { ManifestRegistry, RegistryStream } from "./registry.js";

/**
 * How the manifest-derived registry differs from what the player integration
 * registered. Emitted on every manifest refresh while the registry is in
 * shadow mode, so the parse can be judged on real streams before it becomes
 * authoritative. See specs/manifest-registry.md, "Divergence".
 */

export type StreamDivergence = {
  /** Registry stream key: HLS media playlist URL, DASH representation id. */
  readonly key: string;
  readonly type: StreamType;
  readonly identityHash: string;
  /** The player-registered stream this one was matched to, if any. */
  readonly playerRuntimeId?: string;
  /** False when the matched player stream hashes to a different identity. */
  readonly identityHashMatches?: boolean;
  /** Both inputs to the hash, present only when the identities differ. */
  readonly identityInputs?: {
    readonly manifest: StreamProperties;
    readonly player: StreamProperties;
  };
  readonly segmentsOnlyInManifest: number;
  readonly segmentsOnlyInPlayer: number;
  readonly segmentsCompared: number;
  /**
   * Player and manifest timelines may be offset by a constant (wall-clock PDT
   * against a zero-based player timeline). The offset is reported; the
   * deltas below are measured after removing it, so they show boundary
   * disagreement rather than timebase choice.
   */
  readonly timelineOffset: number;
  readonly maxStartTimeDelta: number;
  readonly maxEndTimeDelta: number;
  readonly externalIdMismatches: number;
  /** First and last segment start on each side, to see which side's window is wider. */
  readonly manifestRange?: readonly [number, number];
  readonly playerRange?: readonly [number, number];
  readonly onlyInManifestSample?: string;
  readonly onlyInPlayerSample?: string;
  readonly sample?: {
    readonly key: string;
    readonly playerExternalId: number;
    readonly manifestExternalId: number;
    readonly startTimeDelta: number;
  };
};

export type ManifestDivergenceDetails = {
  readonly manifestUrl: string;
  readonly streams: readonly StreamDivergence[];
  /** Player-registered streams no manifest stream matched. */
  readonly unmatchedPlayerStreams: readonly string[];
};

export function computeDivergence(
  registry: ManifestRegistry,
  playerStreams: Iterable<StreamWithSegments>,
  manifestUrl: string,
): ManifestDivergenceDetails {
  const players = Array.from(playerStreams);
  const matched = new Set<StreamWithSegments>();
  const streams: StreamDivergence[] = [];

  for (const stream of registry.getStreams()) {
    const player = matchPlayerStream(stream, players);
    if (player) matched.add(player);
    streams.push(compareStream(stream, player));
  }

  return {
    manifestUrl,
    streams,
    unmatchedPlayerStreams: players
      .filter((p) => !matched.has(p))
      .map((p) => p.runtimeId),
  };
}

/**
 * hls.js registers a level under its media playlist URL, which is also the
 * registry key, so an exact match wins outright. Otherwise candidates are
 * ranked: a player stream that shares segment URLs *and* identity is the same
 * stream beyond doubt; shared segments alone still prove it is the same stream
 * while exposing an identity disagreement; identity alone is the weakest, since
 * Shaka creates several stream objects for one rendition and only some carry
 * segments.
 */
function matchPlayerStream(
  stream: RegistryStream,
  players: readonly StreamWithSegments[],
): StreamWithSegments | undefined {
  const exact = players.find((p) => p.runtimeId === stream.key);
  if (exact) return exact;

  let best: StreamWithSegments | undefined;
  let bestScore = 0;
  for (const p of players) {
    if (p.type !== stream.type) continue;
    const sharesIdentity = p.identityHash === stream.identityHash;
    const sharesSegments = sharesAnySegment(stream, p);
    const score = (sharesSegments ? 2 : 0) + (sharesIdentity ? 1 : 0);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

function sharesAnySegment(
  stream: RegistryStream,
  player: StreamWithSegments,
): boolean {
  for (const key of stream.segments.keys()) {
    if (player.segments.has(key)) return true;
  }
  return false;
}

function compareStream(
  stream: RegistryStream,
  player: StreamWithSegments | undefined,
): StreamDivergence {
  const base = {
    key: stream.key,
    type: stream.type,
    identityHash: stream.identityHash,
  };

  if (!player) {
    return {
      ...base,
      segmentsOnlyInManifest: stream.segments.size,
      segmentsOnlyInPlayer: 0,
      segmentsCompared: 0,
      timelineOffset: 0,
      maxStartTimeDelta: 0,
      maxEndTimeDelta: 0,
      externalIdMismatches: 0,
    };
  }

  const common: { manifest: RegistryStreamSegment; player: PlayerSegment }[] =
    [];
  let segmentsOnlyInManifest = 0;
  let onlyInManifestSample: string | undefined;
  for (const segment of stream.segments.values()) {
    const p = player.segments.get(segment.key);
    if (p) {
      common.push({ manifest: segment, player: p });
    } else {
      segmentsOnlyInManifest++;
      onlyInManifestSample ??= segment.key;
    }
  }
  const segmentsOnlyInPlayer = player.segments.size - common.length;
  let onlyInPlayerSample: string | undefined;
  if (segmentsOnlyInPlayer) {
    for (const key of player.segments.keys()) {
      if (!stream.segments.has(key)) {
        onlyInPlayerSample = key;
        break;
      }
    }
  }

  const offsets = common
    .map(({ manifest, player }) => player.startTime - manifest.startTime)
    .sort((a, b) => a - b);
  const timelineOffset = offsets.length
    ? offsets[Math.floor(offsets.length / 2)]
    : 0;

  let maxStartTimeDelta = 0;
  let maxEndTimeDelta = 0;
  let externalIdMismatches = 0;
  let sample: StreamDivergence["sample"];

  for (const { manifest, player: p } of common) {
    const startTimeDelta = p.startTime - manifest.startTime - timelineOffset;
    const endTimeDelta = p.endTime - manifest.endTime - timelineOffset;
    maxStartTimeDelta = Math.max(maxStartTimeDelta, Math.abs(startTimeDelta));
    maxEndTimeDelta = Math.max(maxEndTimeDelta, Math.abs(endTimeDelta));
    if (p.externalId !== manifest.externalId) {
      externalIdMismatches++;
      sample ??= {
        key: manifest.key,
        playerExternalId: p.externalId,
        manifestExternalId: manifest.externalId,
        startTimeDelta,
      };
    }
  }

  const identityHashMatches = player.identityHash === stream.identityHash;
  return {
    ...base,
    playerRuntimeId: player.runtimeId,
    identityHashMatches,
    identityInputs: identityHashMatches
      ? undefined
      : { manifest: stream.properties, player: player.properties },
    segmentsOnlyInManifest,
    segmentsOnlyInPlayer,
    segmentsCompared: common.length,
    timelineOffset,
    maxStartTimeDelta,
    maxEndTimeDelta,
    externalIdMismatches,
    manifestRange: startRange(stream.segments.values()),
    playerRange: startRange(player.segments.values()),
    onlyInManifestSample,
    onlyInPlayerSample,
    sample,
  };
}

function startRange(
  segments: Iterable<{ startTime: number }>,
): readonly [number, number] | undefined {
  let min = Infinity;
  let max = -Infinity;
  for (const { startTime } of segments) {
    min = Math.min(min, startTime);
    max = Math.max(max, startTime);
  }
  return min <= max ? [min, max] : undefined;
}

type RegistryStreamSegment =
  RegistryStream["segments"] extends ReadonlyMap<string, infer S> ? S : never;
type PlayerSegment =
  StreamWithSegments["segments"] extends Map<string, infer S> ? S : never;
