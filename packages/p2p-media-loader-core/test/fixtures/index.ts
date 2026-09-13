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
