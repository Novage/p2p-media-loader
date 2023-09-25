export class FetchError extends Error {
  public code: number;
  public details: object;

  constructor(message: string, code: number, details: object) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export class RequestAbortError extends Error {
  constructor(message = "AbortError") {
    super(message);
  }
}

export class PeerRequestError extends Error {
  constructor(
    readonly type:
      | "abort"
      | "request-timeout"
      | "response-bytes-mismatch"
      | "segment-absent"
      | "peer-closed"
      | "destroy"
  ) {
    super();
  }
}
