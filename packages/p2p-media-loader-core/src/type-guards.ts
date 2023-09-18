import {
  PeerSegmentRequestCommand,
  PeerCommand,
  PeerSegmentAnnouncementCommand,
} from "./internal-types";
import { PeerCommandType } from "./enums";

export function isPeerSegmentCommand(
  command: object
): command is PeerSegmentRequestCommand {
  return (
    (command as PeerSegmentRequestCommand).c === PeerCommandType.SegmentRequest
  );
}

export function isPeerSegmentMapCommand(
  command: object
): command is PeerSegmentAnnouncementCommand {
  return (
    (command as PeerSegmentAnnouncementCommand).c ===
    PeerCommandType.SegmentsAnnouncement
  );
}

export function isPeerCommand(command: object): command is PeerCommand {
  return (
    (command as PeerCommand).c !== undefined &&
    Object.values(PeerCommandType).includes((command as PeerCommand).c)
  );
}
