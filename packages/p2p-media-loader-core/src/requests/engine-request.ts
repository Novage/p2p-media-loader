import { Segment, SegmentResponse } from "../types";

export type EngineCallbacks = {
  onSuccess: (response: SegmentResponse) => void;
  onError: (reason: CoreRequestError) => void;
};

export class EngineRequest {
  private _status: "pending" | "succeed" | "failed" | "aborted" = "pending";
  private _shouldBeStartedImmediately = false;

  constructor(
    readonly segment: Segment,
    readonly engineCallbacks: EngineCallbacks
  ) {}

  get status() {
    return this._status;
  }

  get shouldBeStartedImmediately() {
    return this._shouldBeStartedImmediately;
  }

  resolve(data: ArrayBuffer, bandwidth: number) {
    if (this._status !== "pending") return;
    this._status = "succeed";
    this.engineCallbacks.onSuccess({ data, bandwidth });
  }

  reject() {
    if (this._status !== "pending") return;
    this._status = "failed";
    this.engineCallbacks.onError(new CoreRequestError("failed"));
  }

  abort() {
    if (this._status !== "pending") return;
    this._status = "aborted";
    this.engineCallbacks.onError(new CoreRequestError("aborted"));
  }

  markAsShouldBeStartedImmediately() {
    this._shouldBeStartedImmediately = true;
  }
}

export class CoreRequestError extends Error {
  constructor(readonly type: "failed" | "aborted") {
    super();
  }
}
