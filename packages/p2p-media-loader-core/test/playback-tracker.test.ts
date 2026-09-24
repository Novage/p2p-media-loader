import { describe, expect, it } from "vitest";
import { PlaybackTracker } from "../src/playback-tracker.js";

const SEG = 6;
const BUFFER_TARGET = 30;
const segment = (i: number) => ({
  externalId: i,
  startTime: i * SEG,
  endTime: (i + 1) * SEG,
});

/**
 * A player against the tracker. The player's truth (playhead, buffer) is
 * simulated; the tracker only ever sees requests, deliveries and — when
 * `report` is on — the contract. Samples are taken at request time, which is
 * when the queue is generated, and reports are pushed on the player's own
 * schedule rather than synchronised to fetches.
 */
function simulate(report: boolean) {
  let clock = 0;
  const tracker = new PlaybackTracker(
    segment(0),
    { initialBufferTarget: BUFFER_TARGET },
    () => clock,
  );
  let playhead = 0;
  let buffered = 0;
  const errors: number[] = [];

  const push = () => {
    if (report) tracker.report({ bufferAhead: buffered, rate: 1 });
  };
  const tick = (seconds: number) => {
    clock += seconds * 1000;
    const consumed = Math.min(buffered, seconds);
    playhead += consumed;
    buffered -= consumed;
    push();
  };
  const estimate = () => {
    const p = tracker.getPlayback();
    return p.bufferEdge - p.bufferAhead;
  };
  const fetchSegment = (i: number) => {
    push();
    tracker.onSegmentRequested(segment(i));
    errors.push(estimate() - playhead);
    tick(0.4);
    tracker.onSegmentDelivered(segment(i));
    buffered += SEG;
    push();
  };

  let next = 0;
  const fillToTarget = () => {
    while (buffered < BUFFER_TARGET) fetchSegment(next++);
  };

  fillToTarget();
  for (let i = 0; i < 30; i++) {
    tick(SEG);
    fetchSegment(next++);
  }
  const steady = errors.splice(0);

  // Seek forward into unbuffered media.
  playhead = 900;
  buffered = 0;
  push();
  next = playhead / SEG;
  fillToTarget();
  const afterSeekForward = errors.splice(0);

  // Seek backward inside the buffer: no request is issued at all.
  playhead -= 10;
  buffered += 10;
  push();
  const seekBackInsideBuffer = estimate() - playhead;

  return {
    steady,
    afterSeekForward,
    seekBackInsideBuffer,
    source: tracker.getPlayback().source,
  };
}

const maxAbs = (xs: number[]) => Math.max(...xs.map(Math.abs));
const meanAbs = (xs: number[]) =>
  xs.reduce((a, x) => a + Math.abs(x), 0) / xs.length;

describe("PlaybackTracker with a reporting integration", () => {
  const r = simulate(true);

  it("uses the reported source", () => expect(r.source).toBe("reported"));

  it("locates the playhead exactly in steady state", () => {
    expect(maxAbs(r.steady)).toBeCloseTo(0, 6);
  });

  it("locates the playhead exactly after a seek into unbuffered media", () => {
    expect(maxAbs(r.afterSeekForward)).toBeCloseTo(0, 6);
  });

  it("locates the playhead exactly after a seek back inside the buffer", () => {
    // The motivating case: no request is issued, yet the edge and the
    // reported buffer are anchored to the same point and cancel.
    expect(r.seekBackInsideBuffer).toBeCloseTo(0, 6);
  });
});

describe("PlaybackTracker inferring from the request pattern", () => {
  const r = simulate(false);

  it("uses the inferred source", () => expect(r.source).toBe("inferred"));

  it("tracks the playhead to within a segment or two in steady state", () => {
    expect(meanAbs(r.steady)).toBeLessThan(SEG);
    expect(maxAbs(r.steady)).toBeLessThan(2 * SEG);
  });

  it("re-anchors on a seek into unbuffered media", () => {
    expect(meanAbs(r.afterSeekForward)).toBeLessThan(SEG);
  });

  it("cannot see a seek that issues no requests", () => {
    // Documented limit: seeking back inside the buffer produces no network
    // activity, so inference has nothing to observe.
    expect(Math.abs(r.seekBackInsideBuffer)).toBeGreaterThan(SEG);
  });
});

describe("PlaybackTracker across buffered islands", () => {
  it("is wrong after a seek into an earlier island until the player requests, then exact", () => {
    // Seen live on the mux VOD: buffer [0,30] and [140,180], playhead at 150,
    // then a seek to 10 with no request. The edge still describes the later
    // island while the report measures the earlier one.
    const t = new PlaybackTracker(segment(0), {}, () => 0);
    for (let i = 0; i < 5; i++) {
      t.onSegmentRequested(segment(i));
      t.onSegmentDelivered(segment(i));
    }
    // Player jumps to 150 s and fills [150, 180) — segments 25..29.
    for (let i = 25; i < 30; i++) {
      t.onSegmentRequested(segment(i));
      t.onSegmentDelivered(segment(i));
    }
    const estimate = () => {
      const p = t.getPlayback();
      return p.bufferEdge - p.bufferAhead;
    };

    // Seek back to 10 s inside [0, 30): the report says 20 s ahead, but the
    // edge is at 180. Wrong by construction, as the spec's table says.
    t.report({ bufferAhead: 20, rate: 1 });
    expect(estimate()).toBe(180 - 20);

    // The player extends the island it is now playing: one request corrects it.
    t.onSegmentRequested(segment(5)); // [30, 36)
    t.report({ bufferAhead: 20, rate: 1 });
    expect(estimate()).toBe(30 - 20);
  });
});

describe("PlaybackTracker buffer edge", () => {
  it("sits at the requested segment's start while in flight", () => {
    const t = new PlaybackTracker(segment(0), {}, () => 0);
    t.onSegmentRequested(segment(1));
    expect(t.getPlayback().bufferEdge).toBe(SEG);
  });

  it("advances to the segment's end once delivered", () => {
    const t = new PlaybackTracker(segment(0), {}, () => 0);
    t.onSegmentRequested(segment(1));
    t.onSegmentDelivered(segment(1));
    expect(t.getPlayback().bufferEdge).toBe(2 * SEG);
  });

  it("never moves backwards on an out-of-order delivery", () => {
    const t = new PlaybackTracker(segment(0), {}, () => 0);
    t.onSegmentRequested(segment(1));
    t.onSegmentRequested(segment(2));
    t.onSegmentDelivered(segment(2));
    t.onSegmentDelivered(segment(1));
    expect(t.getPlayback().bufferEdge).toBe(3 * SEG);
  });
});

describe("PlaybackTracker seek detection", () => {
  it("reports a seek for a non-successor request and not otherwise", () => {
    const t = new PlaybackTracker(segment(5), {}, () => 0);
    expect(t.onSegmentRequested(segment(6))).toBe(false);
    expect(t.onSegmentRequested(segment(6))).toBe(false); // retry
    expect(t.onSegmentRequested(segment(40))).toBe(true);
    expect(t.onSegmentRequested(segment(2))).toBe(true);
  });

  it("judges continuity on the timeline, so DASH ids stepping by 20 are not seeks", () => {
    // DASH: externalId is presentation time in 100 ms units, 2 s segments.
    const dash = (i: number, duration = 2) => ({
      externalId: i * 20,
      startTime: i * duration,
      endTime: (i + 1) * duration,
    });
    const t = new PlaybackTracker(dash(5), {}, () => 0);
    expect(t.onSegmentRequested(dash(6))).toBe(false);
    expect(t.onSegmentRequested(dash(7))).toBe(false);
    // Skipping one segment is a jump; so is going back.
    expect(t.onSegmentRequested(dash(9))).toBe(true);
    expect(t.onSegmentRequested(dash(3))).toBe(true);
  });

  it("tolerates timeline rounding but not a missing segment", () => {
    const t = new PlaybackTracker(
      { externalId: 0, startTime: 0, endTime: 4.0107 },
      {},
      () => 0,
    );
    expect(
      t.onSegmentRequested({ externalId: 40, startTime: 4.01, endTime: 8.02 }),
    ).toBe(false);
    expect(
      t.onSegmentRequested({
        externalId: 120,
        startTime: 12.03,
        endTime: 16.04,
      }),
    ).toBe(true);
  });
});

describe("PlaybackTracker staleness", () => {
  it("falls back to inference once a report is older than the window", () => {
    let clock = 0;
    const t = new PlaybackTracker(
      segment(0),
      { reportStaleAfterMs: 2000 },
      () => clock,
    );
    t.report({ bufferAhead: 20, rate: 1 });
    expect(t.getPlayback().source).toBe("reported");
    clock = 1999;
    expect(t.getPlayback().source).toBe("reported");
    clock = 2001;
    expect(t.getPlayback().source).toBe("inferred");
  });

  it("keeps a paused report current however long the pause lasts", () => {
    // Paused, media events stop, so nothing re-reports. Falling back to
    // inference would decay the estimate as if playing.
    let clock = 0;
    const t = new PlaybackTracker(
      segment(0),
      { reportStaleAfterMs: 2000 },
      () => clock,
    );
    t.report({ bufferAhead: 20, rate: 0 });
    clock = 600_000;
    expect(t.getPlayback()).toMatchObject({
      bufferAhead: 20,
      rate: 0,
      source: "reported",
    });
    // Resuming reports a rate again, and staleness applies as before.
    t.report({ bufferAhead: 20, rate: 1 });
    clock += 2001;
    expect(t.getPlayback().source).toBe("inferred");
  });
});

describe("PlaybackTracker inference after reports stop", () => {
  it("resumes from the last reported buffer, not from an old anchor", () => {
    let clock = 0;
    const t = new PlaybackTracker(
      segment(0),
      { initialBufferTarget: 60, inferredSafetyFactor: 1 },
      () => clock,
    );

    // Ten minutes of playback the core never saw: an integration reporting
    // while the player fetched the stream through its own loader.
    clock += 600_000;
    t.report({ bufferAhead: 24, rate: 1 });

    // Reports stop. One second later the buffer has drained by a second.
    clock += 1000;
    expect(t.getPlayback().source).toBe("reported");
    clock += 1001;
    const playback = t.getPlayback();
    expect(playback.source).toBe("inferred");
    // Anchored on the report: 24 seconds, drained for the 2.001 elapsed since.
    expect(playback.bufferAhead).toBeCloseTo(22, 1);
  });

  it("counts what the core delivered after the report", () => {
    let clock = 0;
    const t = new PlaybackTracker(
      segment(0),
      { initialBufferTarget: 60, inferredSafetyFactor: 1 },
      () => clock,
    );
    t.report({ bufferAhead: 10, rate: 1 });

    // Two segments delivered, three seconds of wall clock gone by.
    t.onSegmentRequested(segment(1));
    t.onSegmentDelivered(segment(1));
    t.onSegmentRequested(segment(2));
    t.onSegmentDelivered(segment(2));
    clock += 3000;

    expect(t.getPlayback().bufferAhead).toBeCloseTo(10 + 2 * SEG - 3, 6);
  });
});

describe("PlaybackTracker inference safety", () => {
  it("scales the inferred buffer down by the safety factor", () => {
    let clock = 0;
    const t = new PlaybackTracker(
      segment(0),
      { inferredSafetyFactor: 0.5, initialBufferTarget: 100 },
      () => clock,
    );
    // Deliver 30 s of media with no time passing: raw estimate is 30.
    for (let i = 0; i < 5; i++) {
      t.onSegmentRequested(segment(i));
      t.onSegmentDelivered(segment(i));
    }
    expect(t.getPlayback().bufferAhead).toBeCloseTo(15, 6);
  });
});

describe("PlaybackTracker: learning the buffer target", () => {
  it("learns a target above the one it started with", () => {
    // The player holds 60 s ahead; the tracker started assuming 10. Learning
    // from an estimate clamped to the current target could only ever lower
    // it, and the inferred buffer would collapse toward one segment.
    let clock = 0;
    const tracker = new PlaybackTracker(
      segment(0),
      { initialBufferTarget: 10 },
      () => clock,
    );
    for (let i = 0; i < 10; i++) {
      tracker.onSegmentRequested(segment(i));
      clock += 100;
      tracker.onSegmentDelivered(segment(i));
    }
    // Idle for far longer than half a segment: the buffer was at its target.
    clock += SEG * 2 * 1000;
    tracker.onSegmentRequested(segment(10));

    const { bufferAhead, source } = tracker.getPlayback();
    expect(source).toBe("inferred");
    expect(bufferAhead).toBeGreaterThan(10 * 0.7);
  });
});
