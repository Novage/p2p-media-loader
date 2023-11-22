// restricted to max 16 item types (4 bits to type definition)
export enum SerializedItem {
  Int,
  SimilarIntArray,
}

function abs(num: bigint): bigint {
  return num < 0 ? -num : num;
}

function getRequiredBytesForInt(num: bigint): number {
  const binaryString = num.toString(2);
  const necessaryBits = num < 0 ? binaryString.length : binaryString.length + 1;
  return Math.ceil(necessaryBits / 8);
}

export function intToBytes(num: bigint): Uint8Array {
  const bytesAmountNumber = getRequiredBytesForInt(num);
  const bytes = new Uint8Array(bytesAmountNumber);
  const bytesAmount = BigInt(bytesAmountNumber);
  const isNegative = num < 0;

  num = abs(num);
  for (let i = 0; i < bytesAmountNumber; i++) {
    const shift = 8n * (bytesAmount - 1n - BigInt(i));
    const byte = (num >> shift) & 0xffn;
    bytes[i] = Number(byte);
  }

  if (isNegative) bytes[0] = bytes[0] | 0b10000000;
  return bytes;
}

export function bytesToInt(bytes: Uint8Array): bigint {
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
  const code = (metadata >> 4) & 0b00001111;
  if (code !== SerializedItem.Int) {
    throw new Error("error");
  }
  const numberBytesLength = metadata & 0b00001111;
  const start = 1;
  const end = start + numberBytesLength;
  return {
    number: bytesToInt(bytes.slice(start, end)),
    byteLength: numberBytesLength + 1,
  };
}

export function serializeSimilarIntArr(numbers: bigint[]) {
  let common = abs(numbers[0]);
  for (let i = 1; i < numbers.length; i++) common &= abs(numbers[i]);

  const diffMask = ~common;
  const diffParts = numbers.map<bigint>((num) => {
    if (num < 0) return -(-num & diffMask);
    return num & diffMask;
  });

  const groups = groupArrayItemsBy(diffParts, (num) =>
    getRequiredBytesForInt(num)
  );
  const bytesSequences: Uint8Array[] = [];
  for (const [byteLength, diffParts] of groups) {
    const bytes = serializeIntSequence(diffParts, byteLength);
    bytesSequences.push(bytes);
  }

  const commonBytes = serializeInt(common);
  return new Uint8Array([
    (SerializedItem.SimilarIntArray << 4) | bytesSequences.length,
    ...commonBytes,
    ...joinUint8Arrays(bytesSequences),
  ]);
}

export function deserializeSimilarIntArr(bytes: Uint8Array) {
  const [metadata] = bytes;
  const code = (metadata & 0b11110000) >> 4;
  const bytesSequencesAmount = metadata & 0b00001111;

  if (code !== SerializedItem.SimilarIntArray) {
    throw new Error("error");
  }

  let offset = 1;
  const { number: commonPart, byteLength: commonPartByteLength } =
    deserializeInt(bytes.slice(offset));
  offset += commonPartByteLength;

  const diffParts: bigint[] = [];
  for (let i = 0; i < bytesSequencesAmount; i++) {
    const { numbers, byteLength } = deserializeIntSequence(bytes.slice(offset));
    diffParts.push(...numbers);
    offset += byteLength;
  }
  const numbers = diffParts.map((diffPart) => {
    if (diffPart < 0) return -(commonPart | -diffPart);
    return commonPart | diffPart;
  });

  return {
    numbers,
    byteLength: offset,
  };
}

function serializeIntSequence(
  numbers: bigint[],
  byteLength: number
): Uint8Array {
  if (byteLength > 8 || byteLength < 1) {
    throw new Error("Byte length should be in range from 1 to 8");
  }
  // 2 bytes for metadata: 3 bits for list item byte length; 13 for arr length
  const arrayLength = numbers.length;
  const bytes = new Uint8Array(2 + arrayLength * byteLength);
  bytes[0] = (byteLength << 5) | ((arrayLength >> 8) & 0b00011111);
  bytes[1] = arrayLength & 0xff;

  for (let i = 0, offset = 2; i < arrayLength; i++, offset += byteLength) {
    const number = numbers[i];
    const numBytes = intToBytes(number);
    bytes.set(numBytes, offset);
  }

  return bytes;
}

function deserializeIntSequence(sequence: Uint8Array): {
  numbers: bigint[];
  byteLength: number;
} {
  const numberByteLength = sequence[0] >> 5;
  const sequenceLength = ((sequence[0] & 0b00011111) << 8) | sequence[1];
  const sequenceByteLength = 2 + numberByteLength * sequenceLength;

  const numbers: bigint[] = [];
  for (
    let i = 0, offset = 2;
    i < sequenceLength;
    i++, offset += numberByteLength
  ) {
    const number = bytesToInt(
      sequence.slice(offset, offset + numberByteLength)
    );
    numbers.push(number);
  }

  return { numbers, byteLength: sequenceByteLength };
}

function groupArrayItemsBy<K, T>(arr: T[], getKey: (item: T) => K) {
  const map = new Map<K, T[]>();
  for (const item of arr) {
    const key = getKey(item);
    const list = map.get(key) ?? [];
    if (!list.length) map.set(key, list);
    list.push(item);
  }

  return map;
}

function joinUint8Arrays(arrays: Uint8Array[]) {
  const byteLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const array of arrays) {
    bytes.set(array, offset);
    offset += array.length;
  }

  return bytes;
}

export class ResizableUint8Array {
  private bytes: Uint8Array[] = [];
  private _length = 0;

  push(bytes: Uint8Array | number | number[]) {
    if (bytes instanceof Uint8Array) {
      this.bytes.push(bytes);
      this._length += bytes.length;
    } else if (Array.isArray(bytes)) {
      this.bytes.push(new Uint8Array(bytes));
      this._length += bytes.length;
    } else {
      this.bytes.push(new Uint8Array([bytes]));
      this._length++;
    }
  }

  getBytes(): Uint8Array {
    return joinUint8Arrays(this.bytes);
  }
}
