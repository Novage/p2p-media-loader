import { Core } from "p2p-media-loader-core";

export const PLAYERS = {
  vidstack_hls: "Vidstack",
  hlsjs_hls: "Hls.js",
  dplayer_hls: "DPlayer",
  clappr_hls: "Clappr",
  plyr_hls: "Plyr",
  openPlayer_hls: "OpenPlayerJS",
  mediaElement_hls: "MediaElement",
  vidstack_indexeddb_hls: "Vidstack IndexedDB example",
  shaka: "Shaka",
  dplayer_shaka: "DPlayer",
  clappr_shaka: "Clappr (DASH only)",
  plyr_shaka: "Plyr",
} as const;
// The HLS live stream specs/verification.md lists; the previous default's
// master playlist now references a variant that does not exist.
export const DEFAULT_STREAM =
  "https://fcc3ddae59ed.us-west-2.playback.live-video.net/api/video/v1/us-west-2.893648527354.channel.DmumNckWFTqz.m3u8";
export const COLORS = {
  yellow: "#faf21b",
  lightOrange: "#ff7f0e",
  lightBlue: "#ADD8E6",
  torchRed: "#ff1745",
};
export const DEFAULT_TRACKERS =
  Core.DEFAULT_STREAM_CONFIG.announceTrackers.join(",");
export const DEBUG_COMPONENT_ENABLED = "true";
