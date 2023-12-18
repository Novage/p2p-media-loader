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
  command: PeerSegmentAnnouncementCommand,
  maxChunkSize: number
) {
  const { c: commandCode, p: loadingByHttp, l: loaded } = command;
  const creator = new BinaryCommandCreator(commandCode, maxChunkSize);
  if (loaded?.length) creator.addSimilarIntArr("l", loaded);
  if (loadingByHttp?.length) {
    creator.addSimilarIntArr("p", loadingByHttp);
  }
  creator.complete();
  return creator.getResultBuffers();
}

function serializePeerSegmentCommand(
  command: PeerSegmentCommand,
  maxChunkSize: number
) {
  const creator = new BinaryCommandCreator(command.c, maxChunkSize);
  creator.addInteger("i", command.i);
  creator.complete();
  return creator.getResultBuffers();
}

function serializePeerSendSegmentCommand(
  command: PeerSendSegmentCommand,
  maxChunkSize: number
) {
  const creator = new BinaryCommandCreator(command.c, maxChunkSize);
  creator.addInteger("i", command.i);
  creator.addInteger("s", command.s);
  creator.complete();
  return creator.getResultBuffers();
}

function serializePeerSegmentRequestCommand(
  command: PeerRequestSegmentCommand,
  maxChunkSize: number
) {
  const creator = new BinaryCommandCreator(command.c, maxChunkSize);
  creator.addInteger("i", command.i);
  if (command.b) creator.addInteger("b", command.b);
  creator.complete();
  return creator.getResultBuffers();
}

export function serializePeerCommand(
  command: PeerCommand,
  maxChunkSize: number
) {
  switch (command.c) {
    case PeerCommandType.CancelSegmentRequest:
    case PeerCommandType.SegmentAbsent:
      return serializePeerSegmentCommand(command, maxChunkSize);
    case PeerCommandType.SegmentRequest:
      return serializePeerSegmentRequestCommand(command, maxChunkSize);
    case PeerCommandType.SegmentsAnnouncement:
      return serializeSegmentAnnouncementCommand(command, maxChunkSize);
    case PeerCommandType.SegmentData:
      return serializePeerSendSegmentCommand(command, maxChunkSize);
  }
}
