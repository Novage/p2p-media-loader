import { BinaryCommandCreator } from "./binary-command-creator";
import {
  PeerSegmentCommand,
  PeerSendSegmentCommand,
  PeerSegmentAnnouncementCommand,
} from "./types";

export function serializeSegmentAnnouncementCommand(
  command: PeerSegmentAnnouncementCommand
) {
  const creator = new BinaryCommandCreator(command.c);
  creator.addSimilarIntArr("l", command.l);
  creator.addSimilarIntArr("p", command.p);
  creator.complete();
  return creator.getResultBuffer();
}

export function serializePeerSegmentCommand(command: PeerSegmentCommand) {
  const creator = new BinaryCommandCreator(command.c);
  creator.addInteger("i", command.i);
  creator.complete();
  return creator.getResultBuffer();
}

export function serializePeerSendSegmentCommand(
  command: PeerSendSegmentCommand
) {
  const creator = new BinaryCommandCreator(command.c);
  creator.addInteger("i", command.i);
  creator.addInteger("s", command.s);
  creator.complete();
  return creator.getResultBuffer();
}
