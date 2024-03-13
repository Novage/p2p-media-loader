export function getControlledPromise<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    resolve: resolve!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    reject: reject!,
  };
}

export function joinChunks(
  chunks: Uint8Array[],
  totalBytes?: number,
): Uint8Array {
  if (totalBytes === undefined) {
    totalBytes = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  }
  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return buffer;
}

export function getPercent(numerator: number, denominator: number): number {
  return (numerator / denominator) * 100;
}

export function getRandomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function utf8ToUintArray(utf8String: string): Uint8Array {
  const encoder = new TextEncoder();
  const hashBytes = new Uint8Array(utf8String.length);
  encoder.encodeInto(utf8String, hashBytes);
  return hashBytes;
}

export function hexToUtf8(hexString: string) {
  const bytes = new Uint8Array(hexString.length / 2);

  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.slice(i, i + 2), 16);
  }
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

export function* arrayBackwards<T>(arr: T[]) {
  for (let i = arr.length - 1; i >= 0; i--) {
    yield arr[i];
  }
}

function isObject(item: unknown): item is Record<string, unknown> {
  return !!item && typeof item === "object" && !Array.isArray(item);
}

function isArray(item: unknown): item is unknown[] {
  return Array.isArray(item);
}

type DeepMergeResult<T, U> =
  T extends Array<infer R1>
    ? U extends Array<infer R2>
      ? Array<R1 | R2>
      : T & U
    : T & U;

export function deepMerge<T, U>(target: T, source: U): DeepMergeResult<T, U> {
  if (isObject(target) && isObject(source)) {
    const output: Record<string, unknown> = { ...target };

    Object.keys(source).forEach((key) => {
      const sourceValue = source[key];
      const targetValue = target[key as keyof T];

      if (isObject(sourceValue)) {
        output[key] = isObject(targetValue)
          ? deepMerge(targetValue as unknown, sourceValue)
          : sourceValue;
      } else if (isArray(sourceValue)) {
        output[key] = isArray(targetValue)
          ? [...targetValue, ...sourceValue]
          : sourceValue;
      } else {
        output[key] = sourceValue;
      }
    });

    return output as DeepMergeResult<T, U>;
  } else if (isArray(target) && isArray(source)) {
    return [...target, ...source] as DeepMergeResult<T, U>;
  }

  return source as DeepMergeResult<T, U>;
}
