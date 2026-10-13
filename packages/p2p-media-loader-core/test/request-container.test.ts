import { describe, expect, it } from "vitest";
import { RequestsContainer } from "../src/requests/request-container.js";
import { BandwidthCalculator } from "../src/bandwidth-calculator.js";
import { EventTarget } from "../src/utils/event-target.js";
import { RequestError, type CoreEventMap } from "../src/types.js";
import type {
  SegmentWithStream,
  StreamWithSegments,
} from "../src/internal-types.js";

const stream = {
  runtimeId: "https://cdn.example/v/720p/index.m3u8",
  type: "main",
  properties: { bitrate: 1_000_000 },
  swarmId: "https://cdn.example/v/master.m3u8",
  streamSwarmId: "v3-swarm-main-id",
  infoHash: "hash",
  segments: new Map(),
} as unknown as StreamWithSegments;

// The container keys requests by segment object, as the stream holds them.
const segments = Array.from(
  { length: 4 },
  (_, i) =>
    ({
      runtimeId: `seg-${i}`,
      externalId: i,
      url: `https://cdn.example/v/720p/${i}.ts`,
      startTime: i * 4,
      endTime: (i + 1) * 4,
      stream,
    }) as SegmentWithStream,
);
const segment = (i: number) => segments[i];

describe("RequestsContainer.loadingHttpRequests", () => {
  it("yields only the HTTP downloads under way", () => {
    // A request keeps its source after its attempt ends. A stopped or failed
    // HTTP download announced as loading would make peers wait for it.
    const requests = new RequestsContainer(
      () => undefined,
      { all: new BandwidthCalculator(), http: new BandwidthCalculator() },
      new EventTarget<CoreEventMap>(),
    );
    const start = (i: number, downloadSource: "http" | "p2p") =>
      requests
        .getOrCreateRequest(segment(i))
        .start(
          downloadSource === "http"
            ? { downloadSource }
            : { downloadSource, peerId: "peer" },
          { onAbort: () => undefined },
        );

    start(0, "http");
    start(1, "http");
    requests.get(segment(1))!.cancel();
    start(2, "http").failWithError(new RequestError("http-error"));
    start(3, "p2p");

    const ids = Array.from(
      requests.loadingHttpRequests(),
      (request) => request.segment.runtimeId,
    );
    expect(ids).toEqual(["seg-0"]);
    requests.destroy();
  });
});
