import * as Serialization from "./binary-serialization";
import { PeerCommandType, PeerCommand } from "./types";

const peerCommandTypes = Object.values(PeerCommandType);

const commandFrameStart = stringToUtf8CodesBuffer("cstr");
const commandFrameEnd = stringToUtf8CodesBuffer("cend");
const commandDivisionFrameStart = stringToUtf8CodesBuffer("dstr");
const commandDivisionFrameEnd = stringToUtf8CodesBuffer("dend");
const commandFrameLength = commandFrameStart.length + commandFrameEnd.length;

export class BinaryCommandCreator {
  private readonly bytes = new Serialization.ResizableUint8Array();
  private resultBuffers: Uint8Array[] = [];
  private status: "creating" | "completed" = "creating";

  constructor(
    commandType: PeerCommandType,
    private readonly maxChunkLength: number
  ) {
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
    this.status = "completed";

    const unframedBuffer = this.bytes.getBuffer();
    if (unframedBuffer.length + commandFrameLength <= this.maxChunkLength) {
      this.resultBuffers.push(
        frameBuffer(unframedBuffer, commandFrameStart, commandFrameEnd)
      );
      return;
    }

    let chunksAmount = Math.ceil(unframedBuffer.length / this.maxChunkLength);
    if (
      Math.ceil(unframedBuffer.length / chunksAmount) + commandFrameLength >
      this.maxChunkLength
    ) {
      chunksAmount++;
    }

    for (const [index, chunk] of splitBufferToEqualChunks(
      unframedBuffer,
      chunksAmount
    )) {
      if (index === 0) {
        this.resultBuffers.push(
          frameBuffer(chunk, commandFrameStart, commandDivisionFrameEnd)
        );
      } else if (index === chunksAmount - 1) {
        this.resultBuffers.push(
          frameBuffer(chunk, commandDivisionFrameStart, commandFrameEnd)
        );
      } else {
        this.resultBuffers.push(
          frameBuffer(chunk, commandDivisionFrameStart, commandDivisionFrameEnd)
        );
      }
    }
  }

  getResultBuffers(): Uint8Array[] {
    if (this.status === "creating" || !this.resultBuffers.length) {
      throw new Error("Command is not complete.");
    }
    return this.resultBuffers;
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

function stringToUtf8CodesBuffer(string: string): Uint8Array {
  const buffer = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) buffer[i] = string.charCodeAt(i);
  return buffer;
}

function* splitBufferToEqualChunks(
  buffer: Uint8Array,
  chunksAmount: number
): Generator<[number, Uint8Array], void> {
  const chunkLength = Math.ceil(buffer.length / chunksAmount);
  for (let i = 0; i < chunksAmount; i++) {
    yield [i, buffer.slice(i * chunkLength, (i + 1) * chunkLength)];
  }
}

function frameBuffer(
  buffer: Uint8Array,
  frameStart: Uint8Array,
  frameEnd: Uint8Array
) {
  const result = new Uint8Array(
    buffer.length + frameStart.length + frameEnd.length
  );
  result.set(frameStart);
  result.set(buffer, frameStart.length);
  result.set(frameEnd, frameStart.length + buffer.length);

  return result;
}
