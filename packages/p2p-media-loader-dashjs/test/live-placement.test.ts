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

/** A live MPD whose segments live in an index, not in the manifest. */
function segmentBaseMpd() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z" minimumUpdatePeriod="PT8S">
  <Period id="0" start="PT0S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v" bandwidth="2000000" codecs="avc1.64001f" width="1280" height="720">
        <BaseURL>v.mp4</BaseURL>
        <SegmentBase indexRange="786-1009">
          <Initialization range="0-785"/>
        </SegmentBase>
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
    delay: {
      liveDelay: number | undefined;
      liveDelayFragmentCount?: number | null;
      useSuggestedPresentationDelay?: boolean;
    };
    buffer: Record<string, number | undefined>;
  };
};

function setup(
  liveDelay: number | undefined = NaN,
  buffer: Record<string, number | undefined> = {},
  liveDelayFragmentCount: number | null = NaN,
) {
  const settings: Settings = {
    streaming: {
      // dash.js's own defaults for the three the engine reads.
      delay: {
        liveDelay,
        liveDelayFragmentCount,
        useSuggestedPresentationDelay: true,
      },
      buffer: { ...buffer },
    },
  };
  // The engine attaches its playback tracker to whatever the player hands it.
  const listeners = new Set<() => void>();
  const media = {
    addEventListener: (_event: string, handler: () => void) =>
      listeners.add(handler),
    removeEventListener: (_event: string, handler: () => void) =>
      listeners.delete(handler),
    currentTime: 0,
    playbackRate: 1,
    buffered: { length: 0 },
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
    getVideoElement: vi.fn(() => media as unknown as HTMLMediaElement),
  };
  const engine = new DashJsP2PEngine();
  engine.bindPlayer(player as unknown as MediaPlayerClass);

  // The XHRLoader extension is where every MPD reaches the core, so an MPD is
  // delivered here exactly as dash.js's HTTPLoader would deliver it.
  const [, extension] = player.extend.mock.calls[0] as [
    string,
    (this: FactoryMakerThis) => XhrLoaderLike,
  ];
  // Set while a test wants the response held back, as a refresh in flight is.
  let held: (() => void) | undefined;
  const parent: XhrLoaderLike = {
    load: (
      request: CommonMediaRequestLike,
      response: CommonMediaResponseLike,
    ) => {
      const complete = () => {
        response.status = 200;
        response.url = request.url;
        request.customData?.onloadend?.();
      };
      if (held === undefined) complete();
      else held = complete;
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

  /** Starts an MPD request and hands back the response, to land when called. */
  const holdMpd = (data: string) => {
    held = () => undefined;
    deliverMpd(data);
    const complete = held;
    held = undefined;
    return complete;
  };

  return {
    settings,
    player,
    media,
    listeners,
    deliverMpd,
    holdMpd,
    engine,
    fire,
  };
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

  it("places a window whose delay lands on the one it was held at", () => {
    const { settings, deliverMpd } = setup();
    // Held at 25 while the window could not be sized, then sized at 24: the
    // delay it is already at must not read as a placement, or the forward
    // buffer would be left at dash.js's own minute — the half that decides
    // whether anything is shared at all.
    deliverMpd(segmentBaseMpd());
    expect(settings.streaming.delay.liveDelay).toBe(25);

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

  it("drops a manifest that lands after the engine is destroyed", () => {
    const { holdMpd, engine } = setup();
    const registered: unknown[] = [];
    engine.addEventListener("onStreamAdded", (details) =>
      registered.push(details),
    );

    // A live MPD refreshes every couple of seconds, so one is in flight
    // whenever the integrator switches P2P off.
    const land = holdMpd(mpd(7, 8));
    engine.destroy();
    land();

    expect(registered.length).toBe(0);
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

  it("places a live window again after a presentation that was not live", () => {
    const held = {
      bufferTimeDefault: 18,
      bufferTimeAtTopQuality: 30,
      bufferTimeAtTopQualityLongForm: 60,
    };
    const { settings, deliverMpd } = setup(NaN, held);
    deliverMpd(mpd(7, 8));
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(16);

    // Giving the settings back gives up what was placed with them, or the
    // same window returning would read as already placed and the ceiling
    // would stay off for the rest of the session.
    deliverMpd(vodMpd());
    expect(settings.streaming.buffer).toEqual(held);

    deliverMpd(mpd(7, 8));
    expect(settings.streaming.delay.liveDelay).toBe(48);
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(16);
  });

  it("never raises a setting the integrator holds below the ceiling", () => {
    // Their 4 s is under every ceiling this stream calls for, so the engine
    // passes it through — and must not later mistake it for its own.
    const { settings, deliverMpd } = setup(NaN, { bufferTimeDefault: 4 });
    deliverMpd(mpd(3, 2));
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(4);

    deliverMpd(mpd(30, 2));
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(4);
  });

  it("gives a capped setting back no further than the integrator had it", () => {
    // 8 s, capped to 4 by a window too narrow for it: when the window grows,
    // the 8 s they asked for comes back, not the 15 s ceiling.
    const { settings, deliverMpd } = setup(NaN, { bufferTimeDefault: 8 });
    deliverMpd(mpd(3, 2));
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(4);

    deliverMpd(mpd(30, 2));
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(8);
    expect(settings.streaming.buffer.bufferTimeAtTopQuality).toBe(15);
  });

  it("gives the player its own placement back, delay and all", () => {
    const held = {
      bufferTimeDefault: 18,
      bufferTimeAtTopQuality: 30,
      bufferTimeAtTopQualityLongForm: 60,
    };
    const { settings, deliverMpd, engine } = setup(NaN, held);
    deliverMpd(mpd(7, 8));
    expect(settings.streaming.delay.liveDelay).toBe(48);
    expect(settings.streaming.delay.useSuggestedPresentationDelay).toBe(false);

    // Turning P2P off leaves the player where it was found: dash.js reads
    // liveDelay before anything else, so a delay left behind would park the
    // player where P2P wanted it for the rest of the session.
    engine.destroy();
    expect(settings.streaming.delay.liveDelay).toBeNaN();
    expect(settings.streaming.delay.useSuggestedPresentationDelay).toBe(true);
    expect(settings.streaming.buffer).toEqual(held);
  });

  it("gives the placement back on stream teardown too", () => {
    const { settings, deliverMpd, fire } = setup();
    deliverMpd(mpd(7, 8));
    expect(settings.streaming.delay.liveDelay).toBe(48);

    fire("streamTeardownComplete");
    expect(settings.streaming.delay.liveDelay).toBeNaN();
    expect(settings.streaming.delay.useSuggestedPresentationDelay).toBe(true);
  });

  it("carries a high demand window changed at runtime to the player", () => {
    const { settings, player, deliverMpd, engine } = setup();
    deliverMpd(mpd(7, 8));
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(16);
    const afterFirst = player.updateSettings.mock.calls.length;

    // The ceiling follows the high demand window, which is a dynamic setting,
    // so a steady live window must not hide a change to it.
    engine.applyDynamicConfig({
      core: { mainStream: { highDemandTimeWindow: 40 } },
    });
    deliverMpd(mpd(7, 8));
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(40);
    expect(player.updateSettings.mock.calls.length).toBe(afterFirst + 1);

    // And an unchanged window with unchanged settings still writes nothing.
    deliverMpd(mpd(7, 8));
    expect(player.updateSettings.mock.calls.length).toBe(afterFirst + 1);
  });

  it("ignores a buffer setting that is not a length", () => {
    const { settings, deliverMpd } = setup();
    deliverMpd(mpd(3, 2));

    // dash.js validates nothing it is given, and its typings promise a
    // number: a null left by someone clearing the setting must not come back
    // to the player as its ceiling, where it would read as no buffer at all.
    settings.streaming.buffer.bufferTimeDefault = null as unknown as number;
    deliverMpd(mpd(30, 2));

    expect(settings.streaming.buffer.bufferTimeDefault).toBe(15);
  });

  it("holds a live presentation it cannot size yet off the edge", () => {
    const { settings, deliverMpd } = setup();
    // A live SegmentBase stream lists no segments until its index has been
    // fetched, so this manifest cannot say how wide the window is.
    deliverMpd(segmentBaseMpd());

    expect(settings.streaming.delay.liveDelay).toBe(25);
    expect(settings.streaming.delay.useSuggestedPresentationDelay).toBe(false);
  });

  it("takes the placement over only where the integrator left it to dash.js", () => {
    // Read when the first manifest arrives, not at bind: bindPlayer runs
    // before initialize, and what the integrator configures in between is
    // theirs.
    const { settings, player, deliverMpd } = setup();
    player.updateSettings({ streaming: { delay: { liveDelay: 12 } } });
    player.updateSettings.mockClear();

    deliverMpd(mpd(7, 8));

    expect(settings.streaming.delay.liveDelay).toBe(12);
    expect(player.updateSettings).not.toHaveBeenCalled();
  });

  it("serves the engine bound now, not the one that installed the loader", () => {
    // dash.js keeps the first extension a player is given and ignores every
    // later one, so an integrator swapping engines — the only way to change
    // static core config — would otherwise be left with an inert one.
    const { player, engine, deliverMpd } = setup();
    engine.destroy();

    const second = new DashJsP2PEngine();
    const registered: unknown[] = [];
    second.addEventListener("onStreamAdded", (details) =>
      registered.push(details),
    );
    second.bindPlayer(player as unknown as MediaPlayerClass);

    deliverMpd(mpd(7, 8));

    expect(registered.length).toBe(1);
  });

  it("keeps a destroyed engine's core out of a response another engine inherits", () => {
    // The swap above, with a refresh in flight across it: what the response
    // observes was made against the destroyed engine's core, and rebuilding
    // that core is exactly what letting the player go was meant to stop.
    const { player, engine, holdMpd } = setup();
    const revived: unknown[] = [];
    engine.addEventListener("onStreamAdded", (details) =>
      revived.push(details),
    );

    const land = holdMpd(mpd(7, 8));
    engine.destroy();
    new DashJsP2PEngine().bindPlayer(player as unknown as MediaPlayerClass);
    land();

    expect(revived.length).toBe(0);
  });

  it("leaves a player placed by fragment count alone", () => {
    // dash.js reads liveDelayFragmentCount when liveDelay has none, so an
    // integrator who set it has placed the player just as deliberately.
    const { settings, player, deliverMpd } = setup(NaN, {}, 3);
    deliverMpd(mpd(7, 8));

    expect(settings.streaming.delay.liveDelay).toBeNaN();
    expect(settings.streaming.buffer).toEqual({});
    expect(player.updateSettings).not.toHaveBeenCalled();
  });

  it("places a player whose fragment count is dash.js's other way of saying unset", () => {
    const { settings, deliverMpd } = setup(NaN, {}, null);
    deliverMpd(mpd(7, 8));

    expect(settings.streaming.delay.liveDelay).toBe(48);
  });

  it("gives back only the half it wrote", () => {
    const held = {
      bufferTimeDefault: 18,
      bufferTimeAtTopQuality: 30,
      bufferTimeAtTopQualityLongForm: 60,
    };
    const { settings, deliverMpd, fire } = setup(NaN, held);
    // Held off the edge only: a window it could not size never had its
    // buffer touched.
    deliverMpd(segmentBaseMpd());
    expect(settings.streaming.delay.liveDelay).toBe(25);

    settings.streaming.buffer.bufferTimeDefault = 45;
    fire("streamTeardownComplete");

    expect(settings.streaming.delay.liveDelay).toBeNaN();
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(45);
  });

  it("hands the player over when another engine binds it", () => {
    const { settings, player, deliverMpd } = setup();
    deliverMpd(mpd(7, 8));
    expect(settings.streaming.delay.liveDelay).toBe(48);

    // Binding a second engine without destroying the first: what the first
    // wrote is given back before the second reads the player, or the second
    // would read that placement as the integrator's and never place again.
    const second = new DashJsP2PEngine();
    second.bindPlayer(player as unknown as MediaPlayerClass);
    deliverMpd(mpd(4, 4));

    expect(settings.streaming.delay.liveDelay).toBe(12);
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(8);
  });

  it("brings a raised ceiling back down", () => {
    const { settings, deliverMpd } = setup();
    deliverMpd(mpd(7, 8));
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(16);

    // Raised from outside — the integrator, or dash.js putting back what it
    // shrank for a quota error. A ceiling is only a ceiling while it is
    // enforced, and the window has not moved to prompt a placement.
    settings.streaming.buffer.bufferTimeDefault = 40;
    deliverMpd(mpd(7, 8));

    expect(settings.streaming.buffer.bufferTimeDefault).toBe(16);
  });

  it("stops working for a player it hands over", () => {
    const { player, listeners, deliverMpd } = setup();
    deliverMpd(mpd(7, 8));
    const alone = listeners.size;
    expect(alone).toBeGreaterThan(0);

    // The engine that loses the player lets the media element go with it:
    // two trackers on one element would drive two cores, each fetching and
    // announcing for the same playback.
    const second = new DashJsP2PEngine();
    second.bindPlayer(player as unknown as MediaPlayerClass);

    expect(listeners.size).toBe(alone);
  });

  it("does not push back a ceiling the integrator has since raised again", () => {
    const { settings, deliverMpd } = setup();
    deliverMpd(mpd(7, 8));
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(16);

    // Lowered below the ceiling: kept, and nothing is written.
    settings.streaming.buffer.bufferTimeDefault = 10;
    deliverMpd(mpd(7, 8));
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(10);

    // Raised back to the ceiling: their latest word, not a stale one.
    settings.streaming.buffer.bufferTimeDefault = 16;
    deliverMpd(mpd(7, 8));
    expect(settings.streaming.buffer.bufferTimeDefault).toBe(16);
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
    const { settings, player, deliverMpd } = setup();
    deliverMpd(mpd(7, 8).replace('type="dynamic"', 'type="static"'));
    // Nothing of this engine's is written to a player it has no live window
    // to place, and binding alone writes nothing either.
    expect(player.updateSettings).not.toHaveBeenCalled();
    expect(settings.streaming.delay.liveDelay).toBeNaN();
    expect(settings.streaming.buffer).toEqual({});
  });
});
