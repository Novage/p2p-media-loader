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

/** A live MPD of audio alone, as a radio station publishes. */
function audioMpd(segmentCount: number, segmentSeconds: number) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z" minimumUpdatePeriod="PT8S">
  <Period id="0" start="PT0S">
    <AdaptationSet mimeType="audio/mp4" lang="en">
      <Representation id="a" bandwidth="128000" codecs="mp4a.40.2">
        <SegmentTemplate media="a-$Time$.m4s" initialization="a-init.mp4" timescale="1000">
          <SegmentTimeline>
            <S t="0" d="${segmentSeconds * 1000}" r="${segmentCount - 1}"/>
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;
}

/** A static MPD: a presentation with a duration and no live window. */
function vodMpd() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT600S">
  <Period id="0" start="PT0S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v" bandwidth="2000000" codecs="avc1.64001f" width="1280" height="720">
        <SegmentTemplate media="v-$Number$.m4s" initialization="v-init.mp4" timescale="1000" duration="4000" startNumber="1"/>
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

  const fire = (event: string) => {
    for (const [name, handler] of player.on.mock.calls as [
      string,
      () => void,
    ][]) {
      if (name === event) handler();
    }
  };

  return { settings, player, deliverMpd, engine, fire };
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

  it("gives the buffer back when the window grows", () => {
    const { settings, deliverMpd } = setup();
    // A stream that has just started publishing: three 2 s segments, so the
    // player sits 4 s back and buffers the two segments that leaves room for.
    deliverMpd(mpd(3, 2));
    expect(settings.streaming.delay.liveDelay).toBe(4);
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(4);

    // Minutes later the timeline has filled out to a full DVR window. The
    // buffer this engine set for the short one is not a setting to keep.
    deliverMpd(mpd(30, 2));
    expect(settings.streaming.delay.liveDelay).toBe(58);
    expect(settings.streaming.buffer).toEqual({
      bufferTimeDefault: 15,
      bufferTimeAtTopQuality: 15,
      bufferTimeAtTopQualityLongForm: 15,
    });
  });

  it("still holds to a buffer the integrator lowered while playing", () => {
    const { settings, deliverMpd } = setup();
    deliverMpd(mpd(3, 2));
    // The integrator asks for less than the engine placed, mid-stream.
    settings.streaming.buffer.bufferTimeDefault = 3;

    deliverMpd(mpd(30, 2));
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(3);
    expect(settings.streaming.buffer.bufferTimeAtTopQuality).toBe(15);
  });

  it("gives the player its own buffer back when the next source is not live", () => {
    const held = {
      bufferTimeDefault: 18,
      bufferTimeAtTopQuality: 30,
      bufferTimeAtTopQualityLongForm: 60,
    };
    const { settings, deliverMpd } = setup(NaN, held);
    deliverMpd(mpd(4, 4));
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(8);

    // One player, one engine, the next item in a playlist: dash.js keeps the
    // settings object across attachSource, so a VOD source would otherwise
    // play with the live stream's ceiling.
    deliverMpd(vodMpd());
    expect(settings.streaming.buffer).toEqual(held);
  });

  it("gives it back on stream teardown as well", () => {
    const held = {
      bufferTimeDefault: 18,
      bufferTimeAtTopQuality: 30,
      bufferTimeAtTopQualityLongForm: 60,
    };
    const { settings, deliverMpd, fire } = setup(NaN, held);
    deliverMpd(mpd(4, 4));
    fire("streamTeardownComplete");
    expect(settings.streaming.buffer).toEqual(held);
  });

  it("places the next live source on its own window", () => {
    const { settings, deliverMpd, fire } = setup(NaN, {
      bufferTimeDefault: 18,
      bufferTimeAtTopQuality: 30,
      bufferTimeAtTopQualityLongForm: 60,
    });
    deliverMpd(mpd(7, 8));
    expect(settings.streaming.delay.liveDelay).toBe(48);
    fire("streamTeardownComplete");

    // A window whose delay is within half a segment of the last source's is
    // still this source's to place.
    deliverMpd(mpd(7, 8));
    expect(settings.streaming.delay.liveDelay).toBe(48);
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(16);
  });

  it("stops routing through the core once the engine is destroyed", () => {
    const { deliverMpd, engine } = setup();
    const registered: unknown[] = [];
    engine.addEventListener("onStreamAdded", (details) =>
      registered.push(details),
    );

    deliverMpd(mpd(7, 8));
    expect(registered.length).toBe(1);

    // dash.js keeps the extension for the life of the player, so the router
    // has to stand aside by itself: a core the engine destroyed would be
    // rebuilt by the next refresh and P2P would resume after being stopped.
    engine.destroy();
    deliverMpd(mpd(7, 8));
    expect(registered.length).toBe(1);
  });

  it("routes again when the same player is bound again", () => {
    const { deliverMpd, engine, player } = setup();
    const registered: unknown[] = [];
    engine.addEventListener("onStreamAdded", (details) =>
      registered.push(details),
    );

    deliverMpd(mpd(7, 8));
    engine.destroy();
    engine.bindPlayer(player as unknown as MediaPlayerClass);

    deliverMpd(mpd(7, 8));
    expect(registered.length).toBe(2);
  });

  it("places a live presentation that is audio alone", () => {
    const { settings, deliverMpd } = setup();
    // Live radio: every stream is typed secondary, since that is what an
    // audio track is beside a video one, and nothing would place it if the
    // main stream were the only one that counted.
    deliverMpd(audioMpd(15, 4));
    expect(settings.streaming.delay.liveDelay).toBe(56);
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(15);
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
