import { PeerCommandType } from "../enums";

export function integerToBytesArray(num: number): Uint8Array {
  const bytesAmount = requiredBytesForInteger(num);
  const bytes = new Uint8Array(bytesAmount);

  for (let i = 0; i < bytesAmount; i++) {
    bytes[i] = (num >> (8 * i)) & 0xff;
  }
  return new Uint8Array(bytes);
}

export function bytesArrayToInteger(bytes: Uint8Array): number {
  let number = 0;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    number += byte << (8 * i);
  }

  return number;
}

function requiredBytesForInteger(num: number) {
  num = Math.abs(num);
  const bits = Math.floor(Math.log2(num)) + 1;
  return Math.ceil(bits / 8);
}

// restricted to max 8 item types (3 bits to type definition)
enum SerializedItem {
  Number,
  Array,
}

export function serializeNumber(num: number) {
  const numBytes = integerToBytesArray(num);
  // 5 bits for
  const numberMetadata = (SerializedItem.Number << 5) | numBytes.length;
  return new Uint8Array([numberMetadata, ...numBytes]);
}

export function deserializeNumber(bytes: Uint8Array, position: number) {
  const metadata = bytes[position];
  const code = (metadata & 0b11100000) >> 5;
  if (code !== SerializedItem.Number) {
    throw new Error("error");
  }
  const numberBytesLength = metadata & 0b00011111;
  const start = position + 1;
  const end = start + numberBytesLength;
  return [bytesArrayToInteger(bytes.slice(start, end)), numberBytesLength + 1];
}

export function serializeNumberArray(numbers: number[]) {
  const { length } = numbers;
  const arrayBytes: number[] = [
    (SerializedItem.Array << 5) | ((length & 0b11100000000) >> 8),
    length & 0xff,
  ];
  for (const number of numbers) {
    const numBytes = serializeNumber(number);
    arrayBytes.push(...numBytes);
  }

  return new Uint8Array(arrayBytes);
}

export function deserializeArray(bytes: Uint8Array, position: number) {
  const metadata = [bytes[position], bytes[position + 1]];
  const code = (metadata[0] & 0b11100000) >> 5;
  if (code !== SerializedItem.Array) {
    throw new Error("error");
  }
  const arrayLength = ((metadata[0] & 0b00011111) << 8) | (metadata[1] & 0xff);

  let start = position + 2;
  const numbers: number[] = [];
  for (let i = 0; i < arrayLength; i++) {
    const [number, byteLength] = deserializeNumber(bytes, start);
    start += byteLength;
    numbers.push(number);
  }

  return numbers;
}

function getCommandBytes() {
  const bytes: number[] = [
    "{".charCodeAt(0),
    PeerCommandType.CancelSegmentRequest,
    ...serializeNumber(65411),
    "}".charCodeAt(0),
  ];
}
