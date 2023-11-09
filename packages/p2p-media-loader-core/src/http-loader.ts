import { Segment, Settings } from "./types";
import { HttpRequest, LoadProgress } from "./request-container";
import * as Utils from "./utils/utils";

export function getHttpSegmentRequest(
  segment: Segment,
  settings: Pick<Settings, "httpRequestTimeout">
): Readonly<HttpRequest> {
  const headers = new Headers();
  const { url, byteRange } = segment;

  if (byteRange) {
    const { start, end } = byteRange;
    const byteRangeString = `bytes=${start}-${end}`;
    headers.set("Range", byteRangeString);
  }

  const abortController = new AbortController();
  const progress: LoadProgress = {
    loadedBytes: 0,
    startTimestamp: performance.now(),
    chunks: [],
  };
  const loadSegmentData = async () => {
    const requestAbortTimeout = setTimeout(() => {
      const errorType: HttpLoaderError["type"] = "request-timeout";
      abortController.abort(errorType);
    }, settings.httpRequestTimeout);

    try {
      const response = await window.fetch(url, {
        headers,
        signal: abortController.signal,
      });

      if (response.ok) {
        const data = await getDataPromiseAndMonitorProgress(response, progress);
        clearTimeout(requestAbortTimeout);
        return data;
      }
      throw new HttpLoaderError("fetch-error", response.statusText);
    } catch (error) {
      if (error instanceof Error) {
        if ((error.name as HttpLoaderError["type"]) === "manual-abort") {
          throw new HttpLoaderError("manual-abort");
        }
        if ((error.name as HttpLoaderError["type"]) === "request-timeout") {
          throw new HttpLoaderError("request-timeout");
        }
        if (!(error instanceof HttpLoaderError)) {
          throw new HttpLoaderError("fetch-error", error.message);
        }
      }

      throw error;
    }
  };

  return {
    type: "http",
    promise: loadSegmentData(),
    progress,
    abort: () => {
      const abortErrorType: HttpLoaderError["type"] = "manual-abort";
      abortController.abort(abortErrorType);
    },
  };
}

async function getDataPromiseAndMonitorProgress(
  response: Response,
  progress: LoadProgress
): Promise<ArrayBuffer> {
  const totalBytesString = response.headers.get("Content-Length");
  if (!response.body) {
    return response.arrayBuffer().then((data) => {
      progress.loadedBytes = data.byteLength;
      progress.totalBytes = data.byteLength;
      progress.lastLoadedChunkTimestamp = performance.now();
      return data;
    });
  }

  if (totalBytesString) progress.totalBytes = +totalBytesString;

  const reader = response.body.getReader();
  progress.startTimestamp = performance.now();

  progress.chunks = [];
  for await (const chunk of readStream(reader)) {
    progress.chunks.push(chunk);
    progress.loadedBytes += chunk.length;
    progress.lastLoadedChunkTimestamp = performance.now();
  }

  progress.totalBytes = progress.loadedBytes;

  return Utils.joinChunks(progress.chunks, progress.totalBytes);
}

async function* readStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<Uint8Array> {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield value;
  }
}

export class HttpLoaderError extends Error {
  constructor(
    readonly type: "request-timeout" | "fetch-error" | "manual-abort",
    message?: string
  ) {
    super(message);
  }
}
