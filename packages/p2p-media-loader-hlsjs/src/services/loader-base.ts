import { SegmentManager } from "./engine";
import {
  HlsConfig,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoadStats,
} from "hls.js";

export interface ByteRange {
  rangeStart: number;
  rangeEnd: number;
}

export abstract class LoaderBase<
  Context extends LoaderContext = LoaderContext
> {
  declare readonly segmentManager: SegmentManager;
  public context!: Context;
  protected config!: LoaderConfiguration | null;
  protected callbacks!: LoaderCallbacks<Context> | null;
  readonly stats: LoadStats;
  readonly abortController: AbortController;
  protected requestTimeout?: number;
  protected response?: Response;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(config: HlsConfig) {
    this.abortController = new AbortController();
    this.stats = {
      buffering: { start: 0, end: 0, first: 0 },
      parsing: { start: 0, end: 0 },
      aborted: false,
      bwEstimate: 0,
      chunkCount: 0,
      loaded: 0,
      loading: { start: 0, end: 0, first: 0 },
      retry: 0,
      total: 0,
    };
  }

  //should not be overridden
  public load(
    context: Context,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<Context>
  ) {
    this.context = context;
    this.config = config;
    this.callbacks = callbacks;
    this.loadAndReport(context, config, callbacks);
  }

  protected abstract loadAndReport(
    context: Context,
    config: LoaderConfiguration,
    callbacks: LoaderCallbacks<Context>
  ): void;

  protected abortInternal() {
    if (!this.response?.ok) {
      this.abortController.abort();
      this.stats.aborted = true;
    }
  }

  public abort() {
    this.abortInternal();
    this.callbacks?.onAbort?.(this.stats, this.context, this.response);
  }

  destroy() {
    this.callbacks = null;
    this.config = null;
    this.abortInternal();
  }

  protected setAbortTimeout(timeout: number) {
    this.clearTimeout();
    this.requestTimeout = setTimeout(() => {
      this.abort();
      this.callbacks?.onTimeout(this.stats, this.context, undefined);
    }, timeout);
  }

  protected clearTimeout() {
    clearTimeout(this.requestTimeout);
  }
}

export class Helper {
  static getByteRangeLength(byteRangeHeader: string): number | undefined {
    const BYTERANGE = /(\d+)-(\d+)\/(\d+)/;
    const result = BYTERANGE.exec(byteRangeHeader);
    if (result) {
      return parseInt(result[2]) - parseInt(result[1]) + 1;
    }
  }

  static getContentLength(headers: Headers): number | undefined {
    const contentRange = headers.get("Content-Range");
    if (contentRange) {
      const byteRangeLength = Helper.getByteRangeLength(contentRange);
      if (Number.isFinite(byteRangeLength)) {
        return byteRangeLength;
      }
    }
    const contentLength = headers.get("Content-Length");
    if (contentLength) {
      return parseInt(contentLength);
    }
  }

  static getBandwidth(contentLength: number, fetchDuration: number) {
    return (contentLength * 8) / fetchDuration;
  }

  static sleep(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  static getByteRangeHeaderString(byteRange: ByteRange) {
    const { rangeStart, rangeEnd } = byteRange;
    return `bytes=${rangeStart}-${rangeEnd - 1}`;
  }
}

export class FetchError extends Error {
  public code: number;
  public details: unknown;

  constructor(message: string, code: number, details: Response) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
