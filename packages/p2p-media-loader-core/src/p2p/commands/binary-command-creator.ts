import * as Serialization from "./binary-serialization";
import { PeerCommandType, PeerCommand } from "./types";

const FRAME_PART_LENGTH = 4;
const commandFrameStart = stringToUtf8CodesBuffer("cstr", FRAME_PART_LENGTH);
const commandFrameEnd = stringToUtf8CodesBuffer("cend", FRAME_PART_LENGTH);
const commandDivFrameStart = stringToUtf8CodesBuffer("dstr", FRAME_PART_LENGTH);
const commandDivFrameEnd = stringToUtf8CodesBuffer("dend", FRAME_PART_LENGTH);
const startFrames = [commandFrameStart, commandDivFrameStart];
const endFrames = [commandFrameEnd, commandDivFrameEnd];
const commandFramesLength = commandFrameStart.length + commandFrameEnd.length;

export function isCommandChunk(buffer: Uint8Array) {
  const length = commandFrameStart.length;
  const bufferEndingToCompare = buffer.slice(-length);
  return (
    startFrames.some((frame) =>
      areBuffersEqual(buffer, frame, FRAME_PART_LENGTH)
    ) &&
    endFrames.some((frame) =>
      areBuffersEqual(bufferEndingToCompare, frame, FRAME_PART_LENGTH)
    )
  );
}

function isFirstCommandChunk(buffer: Uint8Array) {
  return areBuffersEqual(buffer, commandFrameStart, FRAME_PART_LENGTH);
}

function isLastCommandChunk(buffer: Uint8Array) {
  return areBuffersEqual(
    buffer.slice(-FRAME_PART_LENGTH),
    commandFrameEnd,
    FRAME_PART_LENGTH
  );
}

export class BinaryCommandJoiningError extends Error {
  constructor(readonly type: "incomplete-joining" | "no-first-chunk") {
    super();
  }
}

export class BinaryCommandChunksJoiner {
  private readonly chunks = new Serialization.ResizableUint8Array();
  private status: "joining" | "completed" = "joining";

  constructor(
    private readonly onComplete: (commandBuffer: Uint8Array) => void
  ) {}

  addCommandChunk(chunk: Uint8Array) {
    if (this.status === "completed") return;

    const isFirstChunk = isFirstCommandChunk(chunk);
    if (!this.chunks.length && !isFirstChunk) {
      throw new BinaryCommandJoiningError("no-first-chunk");
    }
    if (this.chunks.length && isFirstChunk) {
      throw new BinaryCommandJoiningError("incomplete-joining");
    }
    this.chunks.push(this.unframeCommandChunk(chunk));

    if (!isLastCommandChunk(chunk)) return;
    this.status = "completed";
    this.onComplete(this.chunks.getBuffer());
  }

  private unframeCommandChunk(chunk: Uint8Array) {
    return chunk.slice(FRAME_PART_LENGTH, chunk.length - FRAME_PART_LENGTH);
  }
}

export class BinaryCommandCreator {
  private readonly bytes = new Serialization.ResizableUint8Array();
  private resultBuffers: Uint8Array[] = [];
  private status: "creating" | "completed" = "creating";

  constructor(
    commandType: PeerCommandType,
    private readonly maxChunkLength: number
  ) {
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

  addString(name: string, string: string) {
    this.bytes.push(name.charCodeAt(0));
    const bytes = Serialization.serializeString(string);
    this.bytes.push(bytes);
  }

  complete() {
    if (!this.bytes.length) throw new Error("Buffer is empty");
    if (this.status === "completed") return;
    this.status = "completed";

    const unframedBuffer = this.bytes.getBuffer();
    if (unframedBuffer.length + commandFramesLength <= this.maxChunkLength) {
      this.resultBuffers.push(
        frameBuffer(unframedBuffer, commandFrameStart, commandFrameEnd)
      );
      return;
    }

    let chunksAmount = Math.ceil(unframedBuffer.length / this.maxChunkLength);
    if (
      Math.ceil(unframedBuffer.length / chunksAmount) + commandFramesLength >
      this.maxChunkLength
    ) {
      chunksAmount++;
    }

    for (const [i, chunk] of splitBufferToEqualChunks(
      unframedBuffer,
      chunksAmount
    )) {
      if (i === 0) {
        this.resultBuffers.push(
          frameBuffer(chunk, commandFrameStart, commandDivFrameEnd)
        );
      } else if (i === chunksAmount - 1) {
        this.resultBuffers.push(
          frameBuffer(chunk, commandDivFrameStart, commandFrameEnd)
        );
      } else {
        this.resultBuffers.push(
          frameBuffer(chunk, commandDivFrameStart, commandDivFrameEnd)
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

export function deserializeCommand(bytes: Uint8Array): PeerCommand {
  const [commandCode] = bytes;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deserializedCommand: { [key: string]: any } = {
    c: commandCode,
  };

  let offset = 1;
  while (offset < bytes.length) {
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
      case Serialization.SerializedItem.String:
        {
          const { string, byteLength } = Serialization.deserializeString(
            bytes.slice(offset)
          );
          deserializedCommand[name] = string;
          offset += byteLength;
        }
        break;
    }
  }
  return deserializedCommand as unknown as PeerCommand;
}

function getDataTypeFromByte(byte: number): Serialization.SerializedItem {
  const typeCode = byte >> 4;
  if (!Serialization.serializedItemTypes.includes(typeCode)) {
    throw new Error("Not existing type");
  }

  return typeCode as Serialization.SerializedItem;
}

function stringToUtf8CodesBuffer(string: string, length?: number): Uint8Array {
  if (length && string.length !== length) {
    throw new Error("Wrong string length");
  }
  const buffer = new Uint8Array(length ?? string.length);
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

function areBuffersEqual(
  buffer1: Uint8Array,
  buffer2: Uint8Array,
  length: number
) {
  for (let i = 0; i < length; i++) {
    if (buffer1[i] !== buffer2[i]) return false;
  }
  return true;
}
