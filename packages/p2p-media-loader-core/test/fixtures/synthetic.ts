/**
 * Hand-written manifests covering structures the real snapshots in this
 * directory do not: alternate audio with CHANNELS, subtitle and caption
 * renditions, an I-frame playlist, a live window sliding across two refreshes
 * without PDT, and every DASH addressing mode. Deterministic by construction.
 */

export const HLS_MASTER_WITH_AUDIO = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="2",URI="audio/en/index.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Deutsch",LANGUAGE="de",CHANNELS="6",URI="audio/de/index.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="subs/en/index.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Deutsch",LANGUAGE="de",URI="subs/de/index.m3u8"
#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",NAME="English",LANGUAGE="en",INSTREAM-ID="CC1"
#EXT-X-STREAM-INF:BANDWIDTH=4521000,AVERAGE-BANDWIDTH=4200000,CODECS="avc1.64002a,mp4a.40.2",RESOLUTION=1920x1080,FRAME-RATE=29.970,VIDEO-RANGE=SDR,AUDIO="aud",SUBTITLES="subs",CLOSED-CAPTIONS="cc"
video/1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=0,CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=640x360,AUDIO="aud",SUBTITLES="subs",CLOSED-CAPTIONS="cc"
video/360p/index.m3u8
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100000,CODECS="avc1.64002a",RESOLUTION=1920x1080,URI="video/1080p/iframes.m3u8"
`;

/**
 * Alternate video renditions, one group per tier. "Main" is the variant's own
 * playlist, "Muxed" has no playlist of its own; only "Wide" is a stream beside
 * the variant.
 */
export const HLS_MASTER_WITH_VIDEO_RENDITIONS = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="cam-1080",NAME="Main",DEFAULT=YES,AUTOSELECT=YES,URI="video/1080p/index.m3u8"
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="cam-1080",NAME="Wide",LANGUAGE="en",URI="video/1080p/wide.m3u8"
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="cam-1080",NAME="Muxed"
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="cam-720",NAME="Main",DEFAULT=YES,URI="video/720p/index.m3u8"
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="cam-720",NAME="Wide",URI="video/720p/wide.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=5000000,CODECS="avc1.64002a,mp4a.40.2",RESOLUTION=1920x1080,FRAME-RATE=30.000,VIDEO="cam-1080"
video/1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=1280x720,VIDEO="cam-720"
video/720p/index.m3u8
`;

/** A subtitle rendition's media playlist: WebVTT segments, ENDLIST. */
export const HLS_MEDIA_WEBVTT = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:60
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:60.000,
subs0.vtt
#EXTINF:60.000,
subs1.vtt
#EXT-X-ENDLIST
`;

/** An I-frame playlist: byte ranges into the variant's segments, I-frames only. */
export const HLS_MEDIA_IFRAMES_ONLY = `#EXTM3U
#EXT-X-VERSION:4
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-I-FRAMES-ONLY
#EXTINF:6.000,
#EXT-X-BYTERANGE:1000@0
media.mp4
#EXTINF:6.000,
#EXT-X-BYTERANGE:1200@1600
media.mp4
#EXT-X-ENDLIST
`;

/** VOD media playlist: init segment, byte ranges, a discontinuity, ENDLIST. */
export const HLS_MEDIA_VOD_BYTERANGE = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-MAP:URI="init.mp4",BYTERANGE="600@0"
#EXTINF:6.000,
#EXT-X-BYTERANGE:1000@600
media.mp4
#EXTINF:6.000,
#EXT-X-BYTERANGE:1200@1600
media.mp4
#EXT-X-DISCONTINUITY
#EXTINF:4.000,
#EXT-X-BYTERANGE:800@2800
media.mp4
#EXT-X-ENDLIST
`;

/** Live window without PDT, media sequence 100..104. */
export const HLS_LIVE_NO_PDT_REFRESH_1 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:100
#EXTINF:6.000,
seg100.ts
#EXTINF:6.000,
seg101.ts
#EXTINF:5.500,
seg102.ts
#EXTINF:6.000,
seg103.ts
#EXTINF:6.000,
seg104.ts
`;

/** The same window slid by two segments: 102..106. */
export const HLS_LIVE_NO_PDT_REFRESH_2 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:102
#EXTINF:5.500,
seg102.ts
#EXTINF:6.000,
seg103.ts
#EXTINF:6.000,
seg104.ts
#EXTINF:6.000,
seg105.ts
#EXTINF:6.000,
seg106.ts
`;

/** Low-latency tags that must be parsed only to be ignored. */
export const HLS_LIVE_LL = `#EXTM3U
#EXT-X-VERSION:9
#EXT-X-TARGETDURATION:4
#EXT-X-PART-INF:PART-TARGET=1.0
#EXT-X-MEDIA-SEQUENCE:50
#EXTINF:4.000,
seg50.mp4
#EXT-X-PART:DURATION=1.0,URI="seg51.part0.mp4"
#EXT-X-PART:DURATION=1.0,URI="seg51.part1.mp4"
#EXTINF:4.000,
seg51.mp4
#EXT-X-PART:DURATION=1.0,URI="seg52.part0.mp4"
#EXT-X-PRELOAD-HINT:TYPE=PART,URI="seg52.part1.mp4"
`;

const MPD = (
  type: string,
  body: string,
) => `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-live:2011" type="${type}" mediaPresentationDuration="PT40S" minBufferTime="PT2S">
${body}
</MPD>`;

export const DASH_SEGMENT_TEMPLATE = MPD(
  "static",
  `  <Period id="0" start="PT0S">
    <AdaptationSet mimeType="video/mp4" frameRate="30000/1001">
      <Representation id="video-720p" bandwidth="1000000" codecs="avc1.4d401f" width="1280" height="720">
        <SegmentTemplate media="v720-$Number$.m4s" initialization="v720-init.mp4" duration="6" timescale="1" startNumber="7"/>
      </Representation>
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4" lang="en" label="English">
      <AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="2"/>
      <Representation id="audio-en" bandwidth="128000" codecs="mp4a.40.2">
        <SegmentTemplate media="aen-$Number$.m4s" initialization="aen-init.mp4" duration="6" timescale="1" startNumber="7"/>
      </Representation>
    </AdaptationSet>
  </Period>`,
);

/**
 * Every kind of AdaptationSet that is not a stream, beside one video and one
 * audio set that are: WebVTT, TTML and IMSC-in-MP4 text, JPEG thumbnails, and
 * three trick-mode video Representations — declared essential on the set,
 * supplemental on the set, and essential on the Representation itself.
 */
export const DASH_WITH_TEXT_IMAGE_AND_TRICK_MODE = MPD(
  "static",
  `  <Period id="0" start="PT0S">
    <AdaptationSet id="0" mimeType="video/mp4" frameRate="30000/1001">
      <Representation id="video-720p" bandwidth="1000000" codecs="avc1.4d401f" width="1280" height="720">
        <SegmentTemplate media="v720-$Number$.m4s" initialization="v720-init.mp4" duration="6" timescale="1" startNumber="1"/>
      </Representation>
    </AdaptationSet>
    <AdaptationSet id="1" mimeType="video/mp4" maxPlayoutRate="32" codingDependency="false">
      <EssentialProperty schemeIdUri="http://dashif.org/guidelines/trickmode" value="0"/>
      <Representation id="video-trick" bandwidth="100000" codecs="avc1.4d401f" width="1280" height="720">
        <SegmentTemplate media="trick-$Number$.m4s" initialization="trick-init.mp4" duration="6" timescale="1" startNumber="1"/>
      </Representation>
    </AdaptationSet>
    <AdaptationSet id="2" mimeType="video/mp4" maxPlayoutRate="8">
      <SupplementalProperty schemeIdUri="http://dashif.org/guidelines/trickmode" value="0"/>
      <Representation id="video-trick-supplemental" bandwidth="200000" codecs="avc1.4d401f" width="640" height="360">
        <SegmentTemplate media="trick2-$Number$.m4s" initialization="trick2-init.mp4" duration="6" timescale="1" startNumber="1"/>
      </Representation>
    </AdaptationSet>
    <AdaptationSet id="3" mimeType="audio/mp4" lang="en">
      <Representation id="audio-en" bandwidth="128000" codecs="mp4a.40.2">
        <SegmentTemplate media="aen-$Number$.m4s" initialization="aen-init.mp4" duration="6" timescale="1" startNumber="1"/>
      </Representation>
    </AdaptationSet>
    <AdaptationSet id="8" mimeType="video/mp4">
      <Representation id="video-trick-representation" bandwidth="150000" codecs="avc1.4d401f" width="1280" height="720" maxPlayoutRate="16">
        <EssentialProperty schemeIdUri="http://dashif.org/guidelines/trickmode" value="0"/>
        <SegmentTemplate media="trick3-$Number$.m4s" initialization="trick3-init.mp4" duration="6" timescale="1" startNumber="1"/>
      </Representation>
    </AdaptationSet>
    <AdaptationSet id="4" mimeType="text/vtt" lang="en">
      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="subtitle"/>
      <Representation id="text-vtt" bandwidth="1000">
        <BaseURL>subs-en.vtt</BaseURL>
      </Representation>
    </AdaptationSet>
    <AdaptationSet id="5" mimeType="application/ttml+xml" lang="de">
      <Representation id="text-ttml" bandwidth="1000">
        <BaseURL>subs-de.ttml</BaseURL>
      </Representation>
    </AdaptationSet>
    <AdaptationSet id="6" contentType="text" mimeType="application/mp4" codecs="stpp" lang="fr">
      <Representation id="text-imsc" bandwidth="2000">
        <SegmentTemplate media="fr-$Number$.m4s" initialization="fr-init.mp4" duration="6" timescale="1" startNumber="1"/>
      </Representation>
    </AdaptationSet>
    <AdaptationSet id="7" contentType="image" mimeType="image/jpeg">
      <SegmentTemplate media="thumb-$Number$.jpg" duration="60" timescale="1" startNumber="1"/>
      <Representation id="thumbnails" bandwidth="5000" width="3200" height="1800">
        <EssentialProperty schemeIdUri="http://dashif.org/guidelines/thumbnail_tile" value="10x10"/>
      </Representation>
    </AdaptationSet>
  </Period>`,
);

/** A live presentation with a trick-mode set beside its video. */
export const DASH_DYNAMIC_WITH_TRICK_MODE = MPD(
  "dynamic",
  `  <Period id="0" start="PT0S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v" bandwidth="2000000" codecs="avc1.64001f" width="1920" height="1080">
        <SegmentTemplate media="v-$Time$.m4s" initialization="v-init.mp4" timescale="1000">
          <SegmentTimeline>
            <S t="120000" d="4000" r="2"/>
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
    <AdaptationSet mimeType="video/mp4" maxPlayoutRate="32">
      <EssentialProperty schemeIdUri="http://dashif.org/guidelines/trickmode" value="0"/>
      <Representation id="v-trick" bandwidth="100000" codecs="avc1.64001f" width="1920" height="1080">
        <SegmentTemplate media="t-$Time$.m4s" initialization="t-init.mp4" timescale="1000">
          <SegmentTimeline>
            <S t="120000" d="4000" r="2"/>
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>`,
);

export const DASH_SEGMENT_TIMELINE_DYNAMIC = MPD(
  "dynamic",
  `  <Period id="0" start="PT0S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v" bandwidth="2000000" codecs="avc1.64001f" width="1920" height="1080">
        <SegmentTemplate media="v-$Time$.m4s" initialization="v-init.mp4" timescale="1000">
          <SegmentTimeline>
            <S t="120000" d="4000" r="2"/>
            <S d="3500"/>
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>`,
);

export const DASH_MULTI_PERIOD = MPD(
  "static",
  `  <Period id="p0" start="PT0S" duration="PT20S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v0" bandwidth="1000000" codecs="avc1.4d401f">
        <SegmentTemplate media="p0-$Number$.m4s" initialization="p0-init.mp4" duration="10" timescale="1" startNumber="1"/>
      </Representation>
    </AdaptationSet>
  </Period>
  <Period id="p1" start="PT20S" duration="PT20S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v0" bandwidth="1000000" codecs="avc1.4d401f">
        <SegmentTemplate media="p1-$Number$.m4s" initialization="p1-init.mp4" duration="10" timescale="1" startNumber="1"/>
      </Representation>
    </AdaptationSet>
  </Period>`,
);

/**
 * A live `SegmentBase` stream, whose period starts 30 s in. Its MPD gives no
 * duration for the parser to lay the index out from, so the index carries no
 * period start and only the playlist does.
 */
export const DASH_SEGMENT_BASE_LIVE = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="dynamic" minBufferTime="PT2S" availabilityStartTime="2026-01-01T00:00:00Z">
  <Period id="1" start="PT30S">
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v-sidx" bandwidth="1000000" codecs="avc1.4d401f" width="1280" height="720">
        <BaseURL>video.mp4</BaseURL>
        <SegmentBase indexRange="700-1500"><Initialization range="0-699"/></SegmentBase>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

export const DASH_SEGMENT_BASE = MPD(
  "static",
  `  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation id="v-sidx" bandwidth="1000000" codecs="avc1.4d401f" width="1280" height="720">
        <BaseURL>video.mp4</BaseURL>
        <SegmentBase indexRange="700-1500"><Initialization range="0-699"/></SegmentBase>
      </Representation>
    </AdaptationSet>
  </Period>`,
);
