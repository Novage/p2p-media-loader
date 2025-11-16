import { CommonCoreConfig, CoreConfig, StreamConfig } from "../types.js";

export function getControlledPromise<T = void>() {
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

export function joinChunks(chunks: Uint8Array[], totalBytes?: number) {
  totalBytes ??= chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);

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
  const bytes = new Uint8Array(utf8String.length);
  encoder.encodeInto(utf8String, bytes);
  return bytes;
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

export function filterUndefinedProps<T extends object>(obj: T): Partial<T> {
  function filter(obj: unknown): unknown {
    if (isObject(obj)) {
      const result: Record<string, unknown> = {};
      Object.keys(obj).forEach((key) => {
        if (obj[key] !== undefined) {
          const value = filter(obj[key]);
          if (value !== undefined) {
            result[key] = value;
          }
        }
      });
      return result;
    } else {
      return obj;
    }
  }

  return filter(obj) as Partial<T>;
}

export function deepCopy<T>(item: T): T {
  if (isArray(item)) {
    return item.map((element) => deepCopy(element)) as T;
  } else if (isObject(item)) {
    const copy = {} as Record<string, unknown>;
    for (const key of Object.keys(item)) {
      copy[key] = deepCopy(item[key]);
    }
    return copy as T;
  } else {
    return item;
  }
}

export function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends object ? RecursivePartial<T[P]> : T[P];
};

export function overrideConfig<T>(
  target: T,
  updates: RecursivePartial<T> | null,
  defaults: RecursivePartial<T> = {} as RecursivePartial<T>,
): T {
  if (
    typeof target !== "object" ||
    target === null ||
    typeof updates !== "object" ||
    updates === null
  ) {
    return target;
  }

  (Object.keys(updates) as (keyof T)[]).forEach((key) => {
    const keyStr = typeof key === "symbol" ? key.toString() : String(key);
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new Error(`Attempt to modify restricted property '${keyStr}'`);
    }

    const updateValue = updates[key];
    const defaultValue = defaults[key];

    if (key in target) {
      if (updateValue === undefined) {
        target[key] =
          defaultValue === undefined
            ? (undefined as (T & object)[keyof T])
            : (defaultValue as (T & object)[keyof T]);
      } else {
        target[key] = updateValue as (T & object)[keyof T];
      }
    }
  });

  return target;
}

type MergeConfigsToTypeOptions = {
  defaultConfig: StreamConfig | CommonCoreConfig | CoreConfig;
  baseConfig?: Partial<CoreConfig>;
  specificStreamConfig?: Partial<StreamConfig>;
};

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function mergeAndFilterConfig<T>(options: MergeConfigsToTypeOptions) {
  const { defaultConfig, baseConfig = {}, specificStreamConfig = {} } = options;

  const mergedConfig = deepCopy({
    ...defaultConfig,
    ...baseConfig,
    ...specificStreamConfig,
  });

  const keysOfT = Object.keys(defaultConfig) as (keyof T)[];
  const filteredConfig: Partial<T> = {};

  keysOfT.forEach((key) => {
    if (key in mergedConfig) {
      filteredConfig[key] = mergedConfig[
        key as keyof typeof mergedConfig
      ] as T[keyof T];
    }
  });

  return filteredConfig as T;
}
