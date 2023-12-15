import * as Serialization from "./binary-serialization";
import { PeerCommandType, PeerCommand } from "./types";

const peerCommandTypes = Object.values(PeerCommandType);

export class BinaryCommandCreator {
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
  return deserializedCommand as unknown as PeerCommand;
}

function getDataTypeFromByte(byte: number): Serialization.SerializedItem {
  const typeCode = byte >> 4;
  if (!Serialization.serializedItemTypes.includes(typeCode)) {
    throw new Error("Not existing type");
  }

  return typeCode as Serialization.SerializedItem;
}
