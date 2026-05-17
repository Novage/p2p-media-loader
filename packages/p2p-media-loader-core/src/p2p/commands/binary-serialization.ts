import { joinChunks } from "../../utils/utils.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf8");

// restricted up to 16 item types (4 bits to type definition)
export const enum SerializedItem {
  Min = -1,
  Int,
  SimilarIntArray,
  String,
  Max,
}

export function getRequiredBytesForInt(num: number): number {
  if (num === 0) return 1;
  const necessaryBits = Math.floor(Math.log2(Math.abs(num))) + 2;
  return Math.ceil(necessaryBits / 8);
}

function intToBytes(num: number): Uint8Array {
  const isNegative = num < 0;
  const bytesAmountNumber = getRequiredBytesForInt(num);
  const bytes = new Uint8Array(bytesAmountNumber);

  num = Math.abs(num);
  for (let i = 0; i < bytesAmountNumber; i++) {
    const shift = 8 * (bytesAmountNumber - 1 - i);
    const byte = Math.floor(num / Math.pow(2, shift)) & 0xff;
    bytes[i] = byte;
  }

  if (isNegative) bytes[0] = bytes[0] | 0b10000000;
  return bytes;
}

function bytesToInt(bytes: Uint8Array): number {
  const byteLength = bytes.length;
  const getNumberPart = (byte: number, i: number): number => {
    const shift = 8 * (byteLength - 1 - i);
    return byte * Math.pow(2, shift);
  };

  // ignore first bit of first byte as it is sign bit
  let number = getNumberPart(bytes[0] & 0b01111111, 0);
  for (let i = 1; i < byteLength; i++) {
    number += getNumberPart(bytes[i], i);
  }
  if ((bytes[0] & 0b10000000) >> 7 !== 0) number = -number;

  return number;
}

export function serializeInt(num: number): Uint8Array {
  const numBytes = intToBytes(num);
  const numberMetadata = (SerializedItem.Int << 4) | numBytes.length;
  return new Uint8Array([numberMetadata, ...numBytes]);
}

export function deserializeInt(bytes: Uint8Array) {
  if (bytes.length === 0) throw new Error("Buffer is too short");
  const metadata = bytes[0];
  const code: SerializedItem = metadata >> 4;
  if (code !== SerializedItem.Int) {
    throw new Error(
      "Trying to deserialize integer with invalid serialized item code",
    );
  }
  const numberBytesLength = metadata & 0b1111;
  const start = 1;
  const end = start + numberBytesLength;
  return {
    number: bytesToInt(bytes.subarray(start, end)),
    byteLength: numberBytesLength + 1,
  };
}

export function serializeSimilarIntArray(numbers: number[]) {
  const commonPartNumbersMap = new Map<number, ResizableUint8Array>();

  for (const number of numbers) {
    const diffByte = number & 0xff;
    const common = number - diffByte;
    const bytes = commonPartNumbersMap.get(common) ?? new ResizableUint8Array();
    if (!bytes.length) commonPartNumbersMap.set(common, bytes);
    bytes.push(diffByte);
  }

  const result = new ResizableUint8Array();
  result.push([SerializedItem.SimilarIntArray << 4, commonPartNumbersMap.size]);

  for (const [commonPart, binaryArray] of commonPartNumbersMap) {
    const { length } = binaryArray.getBytesChunks();
    const commonPartWithLength = commonPart + (length & 0xff);
    binaryArray.unshift(serializeInt(commonPartWithLength));
    result.push(binaryArray.getBuffer());
  }

  return result.getBuffer();
}

export function deserializeSimilarIntArray(bytes: Uint8Array) {
  if (bytes.length < 2) throw new Error("Buffer is too short");
  const [codeByte, commonPartArraysAmount] = bytes;
  const code: SerializedItem = codeByte >> 4;
  if (code !== SerializedItem.SimilarIntArray) {
    throw new Error(
      "Trying to deserialize similar int array with invalid serialized item code",
    );
  }

  let offset = 2;
  const originalIntArr: number[] = [];
  for (let i = 0; i < commonPartArraysAmount; i++) {
    const { number: commonPartWithLength, byteLength } = deserializeInt(
      bytes.subarray(offset),
    );
    offset += byteLength;
    const arrayLength = commonPartWithLength & 0xff;
    const commonPart = commonPartWithLength - arrayLength;

    for (let j = 0; j < arrayLength; j++) {
      const diffPart = bytes[offset];
      originalIntArr.push(commonPart + diffPart);
      offset++;
    }
  }

  return { numbers: originalIntArr, byteLength: offset };
}

export function serializeString(string: string) {
  const encoded = textEncoder.encode(string);
  const { length } = encoded;
  if (length > 4095) {
    throw new Error("String exceeds maximum length of 4095 bytes");
  }

  const bytes = new ResizableUint8Array();
  bytes.push([
    (SerializedItem.String << 4) | ((length >> 8) & 0x0f),
    length & 0xff,
  ]);
  bytes.push(encoded);
  return bytes.getBuffer();
}

export function deserializeString(bytes: Uint8Array) {
  if (bytes.length < 2) throw new Error("Buffer is too short");
  const [codeByte, lengthByte] = bytes;
  const code: SerializedItem = codeByte >> 4;
  if (code !== SerializedItem.String) {
    throw new Error(
      "Trying to deserialize bytes (sting) with invalid serialized item code.",
    );
  }
  const length = ((codeByte & 0x0f) << 8) | lengthByte;
  const stringBytes = bytes.subarray(2, length + 2);
  const string = textDecoder.decode(stringBytes);
  return { string, byteLength: length + 2 };
}

export class ResizableUint8Array {
  #bytes: Uint8Array[] = [];
  #length = 0;

  push(bytes: Uint8Array | number | number[]) {
    this.#addBytes(bytes, "end");
  }

  unshift(bytes: Uint8Array | number | number[]) {
    this.#addBytes(bytes, "start");
  }

  #addBytes(bytes: Uint8Array | number | number[], position: "start" | "end") {
    let bytesToAdd: Uint8Array;
    if (bytes instanceof Uint8Array) {
      bytesToAdd = bytes;
    } else if (Array.isArray(bytes)) {
      bytesToAdd = new Uint8Array(bytes);
    } else {
      bytesToAdd = new Uint8Array([bytes]);
    }
    this.#length += bytesToAdd.length;
    this.#bytes[position === "start" ? "unshift" : "push"](bytesToAdd);
  }

  getBytesChunks(): readonly Uint8Array[] {
    return this.#bytes;
  }

  getBuffer(): Uint8Array {
    return joinChunks(this.#bytes, this.#length);
  }

  get length() {
    return this.#length;
  }
}
