import { JsonSegmentAnnouncement, PeerCommand } from "./internal-types";
import * as TypeGuard from "./type-guards";
import { PeerSegmentStatus } from "./enums";
import * as RIPEMD160 from "ripemd160";

export function generatePeerId(): string {
  const PEER_ID_SYMBOLS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const PEER_ID_LENGTH = 20;

  let peerId = "";

  for (let i = 0; i < PEER_ID_LENGTH - peerId.length; i++) {
    peerId += PEER_ID_SYMBOLS.charAt(
      Math.floor(Math.random() * PEER_ID_SYMBOLS.length)
    );
  }

  return new RIPEMD160().update(peerId).digest("hex");
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
  for (const [index, segmentExternalId] of announcement.i.entries()) {
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
  const segmentIds = [
    ...storedSegmentExternalIds,
    ...loadingByHttpSegmentExternalIds,
  ];
  const segmentStatusSeparator = storedSegmentExternalIds.length;
  return {
    i: segmentIds,
    s: segmentStatusSeparator,
  };
}
