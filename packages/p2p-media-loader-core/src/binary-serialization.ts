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
  const code = metadata >> 4;
  if (code !== SerializedItem.Int) {
    throw new Error(
      "Trying to deserialize integer with invalid serialized item code"
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

  const arrayMetadata = [
    SerializedItem.SimilarIntArray << 4,
    commonPartNumbersMap.size,
  ];
  const result = new ResizableUint8Array();
  result.unshift(arrayMetadata);

  for (const [commonPart, binaryArray] of commonPartNumbersMap) {
    const { length } = binaryArray.getBytesChunks();
    const commonPartWithLength = commonPart | (BigInt(length) & 0xffn);
    binaryArray.unshift(serializeInt(commonPartWithLength));
    result.push(binaryArray.getBytes());
  }

  return result.getBytes();
}

export function deserializeSimilarIntArray(bytes: Uint8Array) {
  const [codeByte, commonPartArraysAmount] = bytes;
  const code = codeByte >> 4;
  if (code !== SerializedItem.SimilarIntArray) {
    throw new Error(
      "Trying to deserialize similar int array with invalid serialized item code"
    );
  }

  let offset = 2;
  const originalIntArr: bigint[] = [];
  for (let i = 0; i < commonPartArraysAmount; i++) {
    const { number: commonPartWithLength, byteLength } = deserializeInt(
      bytes.slice(offset)
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

function joinUint8Arrays(arrays: Uint8Array[], length?: number) {
  const byteLength = length ?? arrays.reduce((sum, arr) => sum + arr.length, 0);
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
    this.addBytes(bytes, "end");
  }

  unshift(bytes: Uint8Array | number | number[]) {
    this.addBytes(bytes, "start");
  }

  private addBytes(
    bytes: Uint8Array | number | number[],
    position: "start" | "end"
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

  getBytes(): Uint8Array {
    return joinUint8Arrays(this.bytes, this._length);
  }

  get length() {
    return this._length;
  }
}
