import { JsonSegmentAnnouncement, PeerCommand } from "../internal-types";
import { PeerCommandType, PeerSegmentStatus } from "../enums";
import RIPEMD160 from "ripemd160";

const HASH_SYMBOLS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const PEER_ID_LENGTH = 20;

export function getStreamHash(streamId: string): string {
  const symbolsCount = HASH_SYMBOLS.length;
  const bytes = new RIPEMD160().update(streamId).digest();
  let hash = "";

  for (const byte of bytes) {
    hash += HASH_SYMBOLS[byte % symbolsCount];
  }

  return hash;
}

export function generatePeerId(): string {
  let peerId = "PEER:";
  const randomCharsAmount = PEER_ID_LENGTH - peerId.length;

  for (let i = 0; i < randomCharsAmount; i++) {
    peerId += HASH_SYMBOLS.charAt(
      Math.floor(Math.random() * HASH_SYMBOLS.length)
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
      if (isPeerCommand(parsed)) return parsed;
    } catch {
      return undefined;
    }
  }
}

export function getSegmentsFromPeerAnnouncement(
  announcement: JsonSegmentAnnouncement
): Map<string, PeerSegmentStatus> {
  const segmentStatusMap = new Map<string, PeerSegmentStatus>();
  announcement.l
    .split("|")
    .forEach((id) => segmentStatusMap.set(id, PeerSegmentStatus.Loaded));

  announcement.p
    .split("|")
    .forEach((id) => segmentStatusMap.set(id, PeerSegmentStatus.LoadingByHttp));
  return segmentStatusMap;
}

export function getJsonSegmentsAnnouncement(
  loadedSegmentExternalIds: string[],
  loadingByHttpSegmentExternalIds: string[]
): JsonSegmentAnnouncement {
  return {
    l: loadedSegmentExternalIds.join("|"),
    p: loadingByHttpSegmentExternalIds.join("|"),
  };
}

function isPeerCommand(command: object): command is PeerCommand {
  return (
    (command as PeerCommand).c !== undefined &&
    Object.values(PeerCommandType).includes((command as PeerCommand).c)
  );
}
