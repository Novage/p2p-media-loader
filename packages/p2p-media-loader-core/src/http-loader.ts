import { RequestAbortError, FetchError } from "./errors";
import { Segment } from "./types";
import { HttpRequest, LoadProgress } from "./request";

export function getHttpSegmentRequest(segment: Segment): Readonly<HttpRequest> {
  const { promise, abortController, progress } = fetchSegmentData(segment);
  return {
    type: "http",
    promise,
    progress,
    abort: () => abortController.abort(),
  };
}

function fetchSegmentData(segment: Segment) {
  const headers = new Headers();
  const { url, byteRange, localId: segmentId } = segment;

  if (byteRange) {
    const { start, end } = byteRange;
    const byteRangeString = `bytes=${start}-${end}`;
    headers.set("Range", byteRangeString);
  }
  const abortController = new AbortController();

  const progress: LoadProgress = {
    canBeTracked: false,
    totalBytes: 0,
    loadedBytes: 0,
    percent: 0,
    startTimestamp: performance.now(),
  };
  const loadSegmentData = async () => {
    try {
      const response = await window.fetch(url, {
        headers,
        signal: abortController.signal,
      });

      if (response.ok) {
        const data = await getDataPromiseAndMonitorProgress(response, progress);
        // Don't return dataPromise immediately
        // should await it for catch correct working
        return data;
      }
      throw new FetchError(
        response.statusText ?? `Network response was not for ${segmentId}`,
        response.status,
        response
      );
    } catch (error) {
      if (isAbortFetchError(error)) {
        throw new RequestAbortError(`Segment fetch was aborted ${segmentId}`);
      }
      throw error;
    }
  };

  return {
    promise: loadSegmentData(),
    abortController,
    progress,
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
      progress.percent = 100;
      return data;
    });
  }

  if (totalBytesString) {
    progress.totalBytes = +totalBytesString;
    progress.canBeTracked = true;
  }

  const reader = response.body.getReader();

  const chunks: Uint8Array[] = [];
  for await (const chunk of readStream(reader)) {
    chunks.push(chunk);
    progress.loadedBytes += chunk.length;
    progress.lastLoadedChunkTimestamp = performance.now();
    if (progress.canBeTracked) {
      progress.percent = (progress.loadedBytes / progress.totalBytes) * 100;
    }
  }

  if (!progress.canBeTracked) {
    progress.totalBytes = progress.loadedBytes;
    progress.percent = 100;
  }
  const resultBuffer = new ArrayBuffer(progress.loadedBytes);
  const view = new Uint8Array(resultBuffer);

  let offset = 0;
  for (const chunk of chunks) {
    view.set(chunk, offset);
    offset += chunk.length;
  }
  return resultBuffer;
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

function isAbortFetchError(error: unknown) {
  return (
    typeof error === "object" &&
    (error as { name?: string }).name === "AbortError"
  );
}
