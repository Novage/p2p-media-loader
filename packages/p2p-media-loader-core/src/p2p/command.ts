import * as Serialization from "../binary-serialization";

export enum PeerCommandType {
  SegmentsAnnouncement,
  SegmentRequest,
  SegmentData,
  SegmentAbsent,
  CancelSegmentRequest,
}

const peerCommandTypes = Object.values(PeerCommandType);

type BasePeerCommand<T extends PeerCommandType = PeerCommandType> = {
  c: T;
};

export type PeerSegmentCommand = BasePeerCommand<
  | PeerCommandType.SegmentRequest
  | PeerCommandType.SegmentAbsent
  | PeerCommandType.CancelSegmentRequest
> & {
  i: number; // segment id
};

export type PeerSegmentAnnouncementCommand =
  BasePeerCommand<PeerCommandType.SegmentsAnnouncement> & {
    l: number[]; // loaded segments
    p: number[]; // segments loading by http
  };

export type PeerSendSegmentCommand =
  BasePeerCommand<PeerCommandType.SegmentData> & {
    i: number; // segment id
    s: number; // size in bytes
  };

export type PeerCommand =
  | PeerSegmentCommand
  | PeerSegmentAnnouncementCommand
  | PeerSendSegmentCommand;

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

export function isCommandBuffer(bytes: Uint8Array) {
  const [start, commandCode] = bytes;
  const end = bytes[bytes.length - 1];

  return (
    start === "{".charCodeAt(0) &&
    end === "}".charCodeAt(0) &&
    peerCommandTypes.includes(commandCode)
  );
}

export function deserializeCommand(bytes: Uint8Array): PeerCommand {
  if (!isCommandBuffer(bytes)) {
    throw new Error("Given bytes don't represent peer command.");
  }
  const [, commandCode] = bytes;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deserializedCommand: { [key: string]: any } = {
    c: commandCode,
  };

  let offset = 2;
  do {
    const name = String.fromCharCode(bytes[offset]);
    offset++;
    const dataType = getDataTypeFromByte(bytes[offset]);

    switch (dataType) {
      case Serialization.SerializedItem.Int:
        {
          const { number, byteLength } = Serialization.deserializeInt(
            bytes.slice(offset)
          );
          deserializedCommand[name] = Number(number);
          offset += byteLength;
        }
        break;
      case Serialization.SerializedItem.SimilarIntArray:
        {
          const { numbers, byteLength } =
            Serialization.deserializeSimilarIntArray(bytes.slice(offset));
          deserializedCommand[name] = numbers.map((n) => Number(n));
          offset += byteLength;
        }
        break;
    }
  } while (offset < bytes.length && bytes[offset] !== "}".charCodeAt(0));
  // TODO: type guards
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return deserializedCommand as any as PeerCommand;
}

function getDataTypeFromByte(byte: number): Serialization.SerializedItem {
  const typeCode = byte >> 4;
  if (!Serialization.serializedItemTypes.includes(typeCode)) {
    throw new Error("Not existing type");
  }

  return typeCode as Serialization.SerializedItem;
}

class BinaryCommandCreator {
  private readonly bytes = new Serialization.ResizableUint8Array();
  private status: "creating" | "completed" = "creating";

  constructor(commandType: PeerCommandType) {
    this.bytes.push("{".charCodeAt(0));
    this.bytes.push(commandType);
  }

  addInteger(name: string, value: number) {
    this.bytes.push(name.charCodeAt(0));
    const bytes = Serialization.serializeInt(BigInt(value));
    this.bytes.push(bytes);
  }

  addSimilarIntArr(name: string, arr: number[]) {
    this.bytes.push(name.charCodeAt(0));
    const bytes = Serialization.serializeSimilarIntArray(
      arr.map((num) => BigInt(num))
    );
    this.bytes.push(bytes);
  }

  complete() {
    if (this.status === "completed") return;
    this.bytes.push("}".charCodeAt(0));
    this.status = "completed";
  }

  getResultBuffer() {
    if (this.status === "creating") {
      throw new Error("Command is not complete.");
    }
    return this.bytes.getBytes();
  }
}
