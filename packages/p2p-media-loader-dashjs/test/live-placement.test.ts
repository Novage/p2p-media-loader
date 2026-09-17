import { describe, expect, it, vi } from "vitest";
import type { MediaPlayerClass } from "dashjs";
import { DashJsP2PEngine } from "../src/engine.js";
import type {
  CommonMediaRequestLike,
  CommonMediaResponseLike,
  FactoryMakerThis,
  XhrLoaderLike,
} from "../src/types.js";

const URL = "https://cdn.example/live/Manifest.mpd";

/**
 * A dynamic MPD with an explicit timeline: the window is what it says, with
 * no dependence on the wall clock the way `SegmentTemplate@duration` has.
 */
function mpd(segmentCount: number, segmentSeconds: number) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z" minimumUpdatePeriod="PT8S">
  <Period id="0" start="PT0S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v" bandwidth="2000000" codecs="avc1.64001f" width="1280" height="720">
        <SegmentTemplate media="v-$Time$.m4s" initialization="v-init.mp4" timescale="1000">
          <SegmentTimeline>
            <S t="0" d="${segmentSeconds * 1000}" r="${segmentCount - 1}"/>
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
}

type Settings = {
  streaming: {
    delay: { liveDelay: number | undefined };
    buffer: Record<string, number | undefined>;
  };
};

function setup(
  liveDelay: number | undefined = NaN,
  buffer: Record<string, number | undefined> = {},
) {
  const settings: Settings = {
    streaming: { delay: { liveDelay }, buffer: { ...buffer } },
  };
  const player = {
    getSettings: vi.fn(() => settings),
    updateSettings: vi.fn(
      (update: { streaming?: Partial<Settings["streaming"]> }) => {
        Object.assign(settings.streaming.delay, update.streaming?.delay);
        Object.assign(settings.streaming.buffer, update.streaming?.buffer);
      },
    ),
    extend: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getVideoElement: vi.fn(() => {
      throw new Error("ELEMENT_NOT_ATTACHED_ERROR");
    }),
  };
  const engine = new DashJsP2PEngine();
  engine.bindPlayer(player as unknown as MediaPlayerClass);

  // The XHRLoader extension is where every MPD reaches the core, so an MPD is
  // delivered here exactly as dash.js's HTTPLoader would deliver it.
  const [, extension] = player.extend.mock.calls[0] as [
    string,
    (this: FactoryMakerThis) => XhrLoaderLike,
  ];
  const parent: XhrLoaderLike = {
    load: (
      request: CommonMediaRequestLike,
      response: CommonMediaResponseLike,
    ) => {
      response.status = 200;
      response.url = request.url;
      request.customData?.onloadend?.();
      return true;
    },
    abort: () => undefined,
  };
  const loader = extension.call({
    context: {},
    factory: {},
    parent,
  } as FactoryMakerThis);

  // dash.js's own loader fills the response in before it calls `onloadend`;
  // the fake parent above only flips the status.
  const deliverMpd = (data: string) =>
    loader.load({ url: URL, customData: { request: { type: "MPD" } } }, {
      status: 0,
      data,
    } satisfies CommonMediaResponseLike);

  return { settings, player, deliverMpd, engine };
}

describe("dash.js live window placement", () => {
  it("places the playhead one segment inside the tail and holds the forward buffer to the high-demand window", () => {
    const { settings, deliverMpd } = setup();
    // A 56 s window of 8 s segments: the playhead 48 s behind the edge, and
    // the buffer held to the high-demand window (15 s), floored at two
    // segments.
    deliverMpd(mpd(7, 8));
    expect(settings.streaming.delay.liveDelay).toBe(48);
    expect(settings.streaming.buffer).toEqual({
      bufferTimeDefault: 16,
      bufferTimeAtTopQuality: 16,
      bufferTimeAtTopQualityLongForm: 16,
    });
  });

  it("keeps the buffer a segment clear of the live edge on a narrow window", () => {
    const { settings, deliverMpd } = setup();
    // A 16 s window of 4 s segments: 12 s behind the edge leaves room for 8 s
    // of buffer, less than the high-demand window. The edge margin binds, not
    // the window.
    deliverMpd(mpd(4, 4));
    expect(settings.streaming.delay.liveDelay).toBe(12);
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(8);
  });

  it("leaves a buffer setting the integrator already holds lower", () => {
    const { settings, deliverMpd } = setup(NaN, {
      bufferTimeDefault: 8,
      bufferTimeAtTopQuality: 8,
      bufferTimeAtTopQualityLongForm: 90,
    });
    deliverMpd(mpd(7, 8));
    expect(settings.streaming.buffer).toEqual({
      bufferTimeDefault: 8,
      bufferTimeAtTopQuality: 8,
      // A minute and a half of buffer is the whole window and more: capped.
      bufferTimeAtTopQualityLongForm: 16,
    });
  });

  it("touches nothing where the integrator configured the live delay", () => {
    const { settings, player, deliverMpd } = setup(8);
    deliverMpd(mpd(7, 8));
    expect(settings.streaming.delay.liveDelay).toBe(8);
    expect(settings.streaming.buffer).toEqual({});
    expect(player.updateSettings).not.toHaveBeenCalled();
  });

  it("places a window whose delay lands on the pre-manifest one", () => {
    const { settings, deliverMpd } = setup();
    // A 30 s window of 6 s segments — a common DVR window — asks for 24 s,
    // within half a segment of the delay bindPlayer set before any manifest.
    // The forward buffer still has to come down from dash.js's own minute.
    deliverMpd(mpd(5, 6));
    expect(settings.streaming.delay.liveDelay).toBe(24);
    expect(settings.streaming.buffer).toEqual({
      bufferTimeDefault: 15,
      bufferTimeAtTopQuality: 15,
      bufferTimeAtTopQualityLongForm: 15,
    });
  });

  it("re-applies only when the window itself changes", () => {
    const { player, settings, deliverMpd } = setup();
    deliverMpd(mpd(7, 8));
    const afterFirst = player.updateSettings.mock.calls.length;
    deliverMpd(mpd(7, 8));
    expect(player.updateSettings.mock.calls.length).toBe(afterFirst);

    deliverMpd(mpd(12, 8));
    expect(settings.streaming.delay.liveDelay).toBe(60);
    expect(player.updateSettings.mock.calls.length).toBe(afterFirst + 1);
  });

  it("does not place a static stream", () => {
    const { settings, deliverMpd } = setup();
    deliverMpd(mpd(7, 8).replace('type="dynamic"', 'type="static"'));
    expect(settings.streaming.delay.liveDelay).toBe(25);
    expect(settings.streaming.buffer).toEqual({});
  });
});
