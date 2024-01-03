import { Segment, SegmentResponse } from "../types";

export type EngineCallbacks = {
  onSuccess: (response: SegmentResponse) => void;
  onError: (reason: CoreRequestError) => void;
};

export class EngineRequest {
  private _status: "pending" | "succeed" | "failed" | "aborted" = "pending";

  constructor(
    readonly segment: Segment,
    readonly engineCallbacks: EngineCallbacks
  ) {}

  get status() {
    return this._status;
  }

  resolve(data: ArrayBuffer, bandwidth: number) {
    this.throwErrorIfNotPending();
    this._status = "succeed";
    this.engineCallbacks.onSuccess({ data, bandwidth });
  }

  reject() {
    this.throwErrorIfNotPending();
    this._status = "failed";
    this.engineCallbacks.onError(new CoreRequestError("failed"));
  }

  abort() {
    this.throwErrorIfNotPending();
    this._status = "aborted";
    this.engineCallbacks.onError(new CoreRequestError("aborted"));
  }

  private throwErrorIfNotPending() {
    if (this._status !== "pending") {
      throw new Error("Engine request has been already settled.");
    }
  }
}

export class CoreRequestError extends Error {
  constructor(readonly type: "failed" | "aborted") {
    super();
  }
}
