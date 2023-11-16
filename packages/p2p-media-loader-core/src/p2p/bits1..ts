import { PeerCommandType } from "../enums";

export function integerToBytesArray(num: number): number[] {
  const bytesAmount = requiredBytesForInteger(num);
  const bytes: number[] = [];

  for (let i = 0; i < bytesAmount; i++) {
    bytes[i] = (num >> (8 * i)) & 0xff;
  }
  return bytes;
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
  NumberArray,
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
  return {
    number: bytesArrayToInteger(bytes.slice(start, end)),
    byteLength: numberBytesLength + 1,
  };
}

function serializeArray(numbers: number[]) {
  const maxBytes = getMaxForArray(numbers, (num) =>
    requiredBytesForInteger(num)
  );

  let common = numbers[0];
  for (let i = 1; i < numbers.length; i++) {
    common &= numbers[i];
  }
  const diffMask = ~common;
  const diff = numbers.map((num) => num & diffMask);
}

function getCommandBytes() {
  const bytes: number[] = [
    "{".charCodeAt(0),
    PeerCommandType.CancelSegmentRequest,
    ...serializeNumber(65411),
    "}".charCodeAt(0),
  ];
}

function getMaxForArray<T>(arr: T[], getValue: (item: T) => number): number {
  let max = Number.MIN_VALUE;
  for (const item of arr) {
    const value = getValue(item);
    if (value > max) max = value;
  }

  return max;
}
