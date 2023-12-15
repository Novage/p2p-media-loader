import { BinaryCommandCreator } from "./binary-command-creator";
import {
  PeerSegmentCommand,
  PeerSendSegmentCommand,
  PeerSegmentAnnouncementCommand,
  PeerRequestSegmentCommand,
  PeerCommand,
  PeerCommandType,
} from "./types";

function serializeSegmentAnnouncementCommand(
  command: PeerSegmentAnnouncementCommand
) {
  const creator = new BinaryCommandCreator(command.c);
  creator.addSimilarIntArr("l", command.l);
  creator.addSimilarIntArr("p", command.p);
  creator.complete();
  return creator.getResultBuffer();
}

function serializePeerSegmentCommand(command: PeerSegmentCommand) {
  const creator = new BinaryCommandCreator(command.c);
  creator.addInteger("i", command.i);
  creator.complete();
  return creator.getResultBuffer();
}

function serializePeerSendSegmentCommand(command: PeerSendSegmentCommand) {
  const creator = new BinaryCommandCreator(command.c);
  creator.addInteger("i", command.i);
  creator.addInteger("s", command.s);
  creator.complete();
  return creator.getResultBuffer();
}

function serializePeerSegmentRequestCommand(
  command: PeerRequestSegmentCommand
) {
  const creator = new BinaryCommandCreator(command.c);
  creator.addInteger("i", command.i);
  if (command.b) creator.addInteger("b", command.b);
  creator.complete();
  return creator.getResultBuffer();
}

export function serializePeerCommand(command: PeerCommand) {
  switch (command.c) {
    case PeerCommandType.CancelSegmentRequest:
    case PeerCommandType.SegmentAbsent:
      return serializePeerSegmentCommand(command);
    case PeerCommandType.SegmentRequest:
      return serializePeerSegmentRequestCommand(command);
    case PeerCommandType.SegmentsAnnouncement:
      return serializeSegmentAnnouncementCommand(command);
    case PeerCommandType.SegmentData:
      return serializePeerSendSegmentCommand(command);
  }
}
