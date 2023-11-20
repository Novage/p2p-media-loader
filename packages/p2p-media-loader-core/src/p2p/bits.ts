import { PeerCommandType } from "./command";

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

export function serializeNumbersArray(numbers: number[], arrayName: string) {
  const byteLengthNumbersBytesMap = new Map<number, number[][]>();

  for (const number of numbers) {
    const numberBytes = integerToBytesArray(number);
    const { length } = numberBytes;
    const list = byteLengthNumbersBytesMap.get(length);
    if (!list) {
      byteLengthNumbersBytesMap.set(length, [numberBytes]);
    } else {
      list.push(numberBytes);
    }
  }

  const arrayBytes: number[] = [
    (SerializedItem.NumberArray << 5) | byteLengthNumbersBytesMap.size,
    arrayName.charCodeAt(0), // amount of different byte length arrays with same name
  ];
  for (const [byteLength, bytesLists] of byteLengthNumbersBytesMap.entries()) {
    arrayBytes.push(byteLength, bytesLists.length & 0xff);
    bytesLists.forEach((list) => arrayBytes.push(...list));
  }

  return new Uint8Array(arrayBytes);
}

export function deserializeNumbersArray(bytes: Uint8Array, position: number) {
  const [metadata, arrayName] = bytes;
  const code = (metadata & 0b11100000) >> 5;
  const arraysAmount = metadata & 0b00011111;
  if (code !== SerializedItem.NumberArray) {
    throw new Error("error");
  }

  const numbersArray: number[] = [];
  let arrayStart = position + 2;
  for (let i = 0; i < arraysAmount; i++) {
    const numberByteLength = bytes[arrayStart];
    const arrayLength = bytes[arrayStart + 1];

    let itemPosition = arrayStart + 2;
    for (let j = 0; j < arrayLength; j++) {
      const end = itemPosition + numberByteLength;
      const number = bytesArrayToInteger(bytes.slice(itemPosition, end));
      numbersArray.push(number);
      itemPosition += numberByteLength;
      arrayStart = itemPosition;
    }
  }

  return { numbersArray, name: arrayName };
}

function getCommandBytes() {
  const bytes: number[] = [
    "{".charCodeAt(0),
    PeerCommandType.CancelSegmentRequest,
    ...serializeNumber(65411),
    "}".charCodeAt(0),
  ];
}
