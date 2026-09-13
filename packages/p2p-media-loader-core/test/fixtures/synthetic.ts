/**
 * Hand-written manifests covering structures the real snapshots in this
 * directory do not: alternate audio with CHANNELS, an I-frame playlist, a
 * live window sliding across two refreshes without PDT, and every DASH
 * addressing mode. Deterministic by construction.
 */

export const HLS_MASTER_WITH_AUDIO = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="2",URI="audio/en/index.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Deutsch",LANGUAGE="de",CHANNELS="6",URI="audio/de/index.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=4521000,AVERAGE-BANDWIDTH=4200000,CODECS="avc1.64002a,mp4a.40.2",RESOLUTION=1920x1080,FRAME-RATE=29.970,VIDEO-RANGE=SDR,AUDIO="aud"
video/1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=0,CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=640x360,AUDIO="aud"
video/360p/index.m3u8
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100000,CODECS="avc1.64002a",RESOLUTION=1920x1080,URI="video/1080p/iframes.m3u8"
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
