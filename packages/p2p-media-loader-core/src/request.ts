import { Segment, SegmentResponse } from "./types";

type PlayerRequest = {
  responsePromise: Promise<SegmentResponse>;
  onSuccess: (response: SegmentResponse) => void;
  onError: (reason?: unknown) => void;
};

export type Request = {
  readonly type: "http" | "p2p";
  readonly segment: Segment;
  playerRequest?: PlayerRequest;
  readonly promise?: Promise<ArrayBuffer>;
  readonly abort: () => void;
};

export class RequestContainer {
  requests = new Map<string, Request>();

  addRequest(request: Request) {
    this.requests.set(request.segment.localId, request);
  }
}
