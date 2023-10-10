import { JsonSegmentAnnouncement, PeerCommand } from "../internal-types";
import * as TypeGuard from "../type-guards";
import { PeerSegmentStatus } from "../enums";

export function generatePeerId(): string {
  // Base64 characters
  const PEER_ID_SYMBOLS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const PEER_ID_LENGTH = 20;

  let peerId = "PEER:";
  const randomCharsAmount = PEER_ID_LENGTH - peerId.length;

  for (let i = 0; i < randomCharsAmount; i++) {
    peerId += PEER_ID_SYMBOLS.charAt(
      Math.floor(Math.random() * PEER_ID_SYMBOLS.length)
    );
  }

  return peerId;
}

export function getPeerCommandFromArrayBuffer(
  data: ArrayBuffer
): PeerCommand | undefined {
  const bytes = new Uint8Array(data);

  // Serialized JSON string check by first, second and last characters: '{" .... }'
  if (
    bytes[0] === 123 &&
    bytes[1] === 34 &&
    bytes[data.byteLength - 1] === 125
  ) {
    try {
      const decoded = new TextDecoder().decode(data);
      const parsed = JSON.parse(decoded) as object;
      if (TypeGuard.isPeerCommand(parsed)) return parsed;
    } catch {
      return undefined;
    }
  }
}

export function getSegmentsFromPeerAnnouncement(
  announcement: JsonSegmentAnnouncement
): Map<string, PeerSegmentStatus> {
  const segmentStatusMap = new Map<string, PeerSegmentStatus>();
  const separator = announcement.s;
  const ids = announcement.i.split("|");
  if (!separator) {
    return new Map(ids.map((id) => [id, PeerSegmentStatus.Loaded]));
  }
  for (const [index, segmentExternalId] of ids.entries()) {
    if (index < separator) {
      segmentStatusMap.set(segmentExternalId, PeerSegmentStatus.Loaded);
    } else {
      segmentStatusMap.set(segmentExternalId, PeerSegmentStatus.LoadingByHttp);
    }
  }
  return segmentStatusMap;
}

export function getJsonSegmentsAnnouncement(
  storedSegmentExternalIds: string[],
  loadingByHttpSegmentExternalIds: string[]
): JsonSegmentAnnouncement {
  let segmentsListing = storedSegmentExternalIds.join("|");
  if (loadingByHttpSegmentExternalIds.length) {
    if (segmentsListing) segmentsListing += "|";
    segmentsListing += loadingByHttpSegmentExternalIds.join("|");
  }
  const announcement: JsonSegmentAnnouncement = { i: segmentsListing };
  if (loadingByHttpSegmentExternalIds.length) {
    announcement.s = storedSegmentExternalIds.length;
  }
  return announcement;
}
