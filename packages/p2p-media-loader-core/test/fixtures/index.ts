import { readFileSync } from "node:fs";

export * from "./synthetic.js";

/** Snapshots of real manifests, fetched once and frozen. */
export function readFixture(name: string): string {
  return readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
}

export const IVS_MASTER_URL =
  "https://fcc3ddae59ed.us-west-2.playback.live-video.net/api/video/v1/us-west-2.893648527354.channel.DmumNckWFTqz.m3u8";
export const MUX_MASTER_URL =
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
export const MUX_720P_URL =
  "https://test-streams.mux.dev/x36xhzz/url_0/193039199_mp4_h264_aac_hd_7.m3u8";
export const BBB_MPD_URL =
  "https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd";
export const ANGEL_ONE_MPD_URL =
  "https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd";
/** Bytes 786-1009 of audio_en_2c_128k_aac.mp4: that representation's `sidx`. */
export const ANGEL_ONE_AUDIO_EN_URL =
  "https://storage.googleapis.com/shaka-demo-assets/angel-one/audio_en_2c_128k_aac.mp4";

export const NETFLIX_TC1_MPD_URL =
  "https://dash.akamaized.net/dash264/TestCases/1a/netflix/exMPD_BIP_TC1.mpd";
/** Representation 5's index range 985-11245: a `sidx` followed by a `uuid` box. */
export const NETFLIX_TC1_VIDEO_0500_URL =
  "http://dash.edgesuite.net/dash264/TestCases/1a/netflix/ElephantsDream_H264BPL30_0500.264.dash";

export function readBinaryFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`./${name}`, import.meta.url)));
}
