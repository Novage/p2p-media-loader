import { joinChunks } from "../../utils/utils";

// restricted up to 16 item types (4 bits to type definition)
export const enum SerializedItem {
  Min = -1,
  Int,
  SimilarIntArray,
  String,
  Max,
}

function abs(num: bigint): bigint {
  return num < 0 ? -num : num;
}

function getRequiredBytesForInt(num: bigint): number {
  const binaryString = num.toString(2);
  const necessaryBits = num < 0 ? binaryString.length : binaryString.length + 1;
  return Math.ceil(necessaryBits / 8);
}

function intToBytes(num: bigint): Uint8Array {
  const isNegative = num < 0;
  const bytesAmountNumber = getRequiredBytesForInt(num);
  const bytes = new Uint8Array(bytesAmountNumber);
  const bytesAmount = BigInt(bytesAmountNumber);

  num = abs(num);
  for (let i = 0; i < bytesAmountNumber; i++) {
    const shift = 8n * (bytesAmount - 1n - BigInt(i));
    const byte = (num >> shift) & 0xffn;
    bytes[i] = Number(byte);
  }

  if (isNegative) bytes[0] = bytes[0] | 0b10000000;
  return bytes;
}

function bytesToInt(bytes: Uint8Array): bigint {
  const byteLength = BigInt(bytes.length);
  const getNumberPart = (byte: number, i: number): bigint => {
    const shift = 8n * (byteLength - 1n - BigInt(i));
    return BigInt(byte) << shift;
  };

  // ignore first bit of first byte as it is sign bit
  let number = getNumberPart(bytes[0] & 0b01111111, 0);
  for (let i = 1; i < byteLength; i++) {
    number = getNumberPart(bytes[i], i) | number;
  }
  if ((bytes[0] & 0b10000000) >> 7 !== 0) number = -number;

  return number;
}

export function serializeInt(num: bigint): Uint8Array {
  const numBytes = intToBytes(num);
  const numberMetadata = (SerializedItem.Int << 4) | numBytes.length;
  return new Uint8Array([numberMetadata, ...numBytes]);
}

export function deserializeInt(bytes: Uint8Array) {
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
    number: bytesToInt(bytes.slice(start, end)),
    byteLength: numberBytesLength + 1,
  };
}

export function serializeSimilarIntArray(numbers: bigint[]) {
  const commonPartNumbersMap = new Map<bigint, ResizableUint8Array>();

  for (const number of numbers) {
    const common = number & ~0xffn;
    const diffByte = number & 0xffn;
    const bytes = commonPartNumbersMap.get(common) ?? new ResizableUint8Array();
    if (!bytes.length) commonPartNumbersMap.set(common, bytes);
    bytes.push(Number(diffByte));
  }

  const result = new ResizableUint8Array();
  result.push([SerializedItem.SimilarIntArray << 4, commonPartNumbersMap.size]);

  for (const [commonPart, binaryArray] of commonPartNumbersMap) {
    const { length } = binaryArray.getBytesChunks();
    const commonPartWithLength = commonPart | (BigInt(length) & 0xffn);
    binaryArray.unshift(serializeInt(commonPartWithLength));
    result.push(binaryArray.getBuffer());
  }

  return result.getBuffer();
}

export function deserializeSimilarIntArray(bytes: Uint8Array) {
  const [codeByte, commonPartArraysAmount] = bytes;
  const code: SerializedItem = codeByte >> 4;
  if (code !== SerializedItem.SimilarIntArray) {
    throw new Error(
      "Trying to deserialize similar int array with invalid serialized item code",
    );
  }

  let offset = 2;
  const originalIntArr: bigint[] = [];
  for (let i = 0; i < commonPartArraysAmount; i++) {
    const { number: commonPartWithLength, byteLength } = deserializeInt(
      bytes.slice(offset),
    );
    offset += byteLength;
    const arrayLength = commonPartWithLength & 0xffn;
    const commonPart = commonPartWithLength & ~0xffn;

    for (let j = 0; j < arrayLength; j++) {
      const diffPart = BigInt(bytes[offset]);
      originalIntArr.push(commonPart | diffPart);
      offset++;
    }
  }

  return { numbers: originalIntArr, byteLength: offset };
}

export function serializeString(string: string) {
  const { length } = string;
  const bytes = new ResizableUint8Array();
  bytes.push([
    (SerializedItem.String << 4) | ((length >> 8) & 0x0f),
    length & 0xff,
  ]);
  bytes.push(new TextEncoder().encode(string));
  return bytes.getBuffer();
}

export function deserializeString(bytes: Uint8Array) {
  const [codeByte, lengthByte] = bytes;
  const code: SerializedItem = codeByte >> 4;
  if (code !== SerializedItem.String) {
    throw new Error(
      "Trying to deserialize bytes (sting) with invalid serialized item code.",
    );
  }
  const length = ((codeByte & 0x0f) << 8) | lengthByte;
  const stringBytes = bytes.slice(2, length + 2);
  const string = new TextDecoder("utf8").decode(stringBytes);
  return { string, byteLength: length + 2 };
}

export class ResizableUint8Array {
  private bytes: Uint8Array[] = [];
  private _length = 0;

  push(bytes: Uint8Array | number | number[]) {
    this.addBytes(bytes, "end");
  }

  unshift(bytes: Uint8Array | number | number[]) {
    this.addBytes(bytes, "start");
  }

  private addBytes(
    bytes: Uint8Array | number | number[],
    position: "start" | "end",
  ) {
    let bytesToAdd: Uint8Array;
    if (bytes instanceof Uint8Array) {
      bytesToAdd = bytes;
    } else if (Array.isArray(bytes)) {
      bytesToAdd = new Uint8Array(bytes);
    } else {
      bytesToAdd = new Uint8Array([bytes]);
    }
    this._length += bytesToAdd.length;
    this.bytes[position === "start" ? "unshift" : "push"](bytesToAdd);
  }

  getBytesChunks(): ReadonlyArray<Uint8Array> {
    return this.bytes;
  }

  getBuffer(): Uint8Array {
    return joinChunks(this.bytes, this._length);
  }

  get length() {
    return this._length;
  }
}
