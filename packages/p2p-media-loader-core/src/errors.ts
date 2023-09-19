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

export class RequestTimeoutError extends Error {
  constructor(message = "TimeoutError") {
    super(message);
  }
}

export class ResponseBytesMismatchError extends Error {
  constructor(message = "ResponseBytesMismatch") {
    super(message);
  }
}

export class PeerSegmentAbsentError extends Error {
  constructor(message = "PeerSegmentAbsent") {
    super(message);
  }
}
