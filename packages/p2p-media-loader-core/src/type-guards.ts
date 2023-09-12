import {
  PeerSegmentCommand,
  PeerCommand,
  PeerCommandType,
  PeerSegmentMapCommand,
} from "./internal-types";

export function isPeerSegmentCommand(
  command: object
): command is PeerSegmentCommand {
  return (command as PeerSegmentCommand).c === PeerCommandType.SegmentRequest;
}

export function isPeerSegmentMapCommand(
  command: object
): command is PeerSegmentMapCommand {
  return (command as PeerSegmentMapCommand).c === PeerCommandType.SegmentMap;
}

export function isPeerCommand(command: object): command is PeerCommand {
  return (
    (command as PeerCommand).c !== undefined &&
    Object.values(PeerCommandType).includes((command as PeerCommand).c)
  );
}
