import { Core } from "p2p-media-loader-core";

export const PLAYERS = {
  videojs10_hls: "Video.js 10",
  vidstack_hls: "Vidstack",
  hlsjs_hls: "HLS.js (raw)",
  dplayer_hls: "DPlayer",
  clappr_hls: "Clappr",
  plyr_hls: "Plyr",
  openPlayer_hls: "OpenPlayerJS",
  mediaElement_hls: "MediaElement",
  vidstack_indexeddb_hls: "Vidstack IndexedDB example",
  shaka: "Shaka Player (raw)",
  dplayer_shaka: "DPlayer",
  clappr_shaka: "Clappr (DASH only)",
  plyr_shaka: "Plyr",
  videojs10_dashjs: "Video.js 10",
  vidstack_dashjs: "Vidstack",
  dashjs: "dash.js (raw)",
  dplayer_dashjs: "DPlayer",
  plyr_dashjs: "Plyr",
  mediaElement_dashjs: "MediaElement",
  videojs: "Video.js 8",
} as const;
// The live streams specs/verification.md lists. (The previous HLS default's
// master playlist now references a variant that does not exist.)
export const DEFAULT_STREAM =
  "https://fcc3ddae59ed.us-west-2.playback.live-video.net/api/video/v1/us-west-2.893648527354.channel.DmumNckWFTqz.m3u8";
// Three video renditions, so quality switching can be exercised on live DASH.
const DEFAULT_DASH_STREAM =
  "https://livesim2.dashif.org/livesim2/testpic4_8s/Manifest.mpd";

/**
 * The stream a player can actually play: dash.js players get the DASH default
 * in place of an HLS URL, HLS.js players the HLS default in place of an MPD.
 * Shaka plays both and keeps whatever was given, as does any URL whose
 * protocol the extension does not reveal.
 */
export function compatibleStreamUrl(player: string, streamUrl: string) {
  const isDash = /\.mpd(\?|#|$)/i.test(streamUrl);
  const isHls = /\.m3u8(\?|#|$)/i.test(streamUrl);
  if (player.includes("dashjs") && isHls) return DEFAULT_DASH_STREAM;
  if (player.includes("hls") && isDash) return DEFAULT_STREAM;
  return streamUrl;
}
export const COLORS = {
  yellow: "#faf21b",
  lightOrange: "#ff7f0e",
  lightBlue: "#ADD8E6",
  torchRed: "#ff1745",
};
export const DEFAULT_TRACKERS =
  Core.DEFAULT_STREAM_CONFIG.announceTrackers.join(",");
export const DEBUG_COMPONENT_ENABLED = "true";
