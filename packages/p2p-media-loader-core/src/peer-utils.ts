import { JsonSegmentAnnouncementMap, PeerCommand } from "./internal-types";
import * as TypeGuard from "./type-guards";
import * as Util from "./utils";
import { PeerSegmentStatus } from "./enums";
import * as RIPEMD160 from "ripemd160";
import { Segment } from "./types";

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

export function getSegmentsFromPeerAnnouncementMap(
  map: JsonSegmentAnnouncementMap
): Map<string, PeerSegmentStatus> {
  const segmentStatusMap = new Map<string, PeerSegmentStatus>();
  for (const [streamId, [segmentIds, statuses]] of Object.entries(map)) {
    for (let i = 0; i < segmentIds.length; i++) {
      const segmentId = segmentIds[i];
      const segmentStatus = statuses[i];
      const segmentFullId = Util.getSegmentFullExternalId(
        streamId,
        segmentId.toString()
      );
      segmentStatusMap.set(segmentFullId, segmentStatus);
    }
  }
  return segmentStatusMap;
}

export function getJsonSegmentsAnnouncementMap(
  streamExternalId: string,
  storedSegments: Segment[],
  loadingByHttpSegments: Segment[]
): JsonSegmentAnnouncementMap {
  const segmentIds: number[] = [];
  const segmentStatuses: PeerSegmentStatus[] = [];

  for (const segment of storedSegments) {
    segmentIds.push(segment.externalId);
    segmentStatuses.push(PeerSegmentStatus.Loaded);
  }

  for (const segment of loadingByHttpSegments) {
    segmentIds.push(segment.externalId);
    segmentStatuses.push(PeerSegmentStatus.LoadingByHttp);
  }

  return {
    [streamExternalId]: [segmentIds, segmentStatuses],
  };
}
