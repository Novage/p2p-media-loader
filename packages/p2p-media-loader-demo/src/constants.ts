export const PLAYERS = {
  vidstack_hls: "Vidstack",
  hlsjs_hls: "Hls.js",
  dplayer_hls: "DPlayer",
  clappr_hls: "Clappr",
  vime_hls: "Vime",
  plyr_hls: "Plyr",
  openPlayer_hls: "OpenPlayerJS",
  mediaElement_hls: "MediaElement",
  shaka: "Shaka",
  dplayer_shaka: "DPlayer",
  clappr_shaka: "Clappr (DASH only)",
  plyr_shaka: "Plyr",
} as const;
export const DEFAULT_STREAM =
  "https://fcc3ddae59ed.us-west-2.playback.live-video.net/api/video/v1/us-west-2.893648527354.channel.DmumNckWFTqz.m3u8";
export const COLORS = {
  yellow: "#faf21b",
  lightOrange: "#ff7f0e",
  lightBlue: "#ADD8E6",
  torchRed: "#ff1745",
};
export const DEFAULT_TRACKERS = `wss://tracker.webtorrent.dev,wss://tracker.files.fm:7073/announce,wss://tracker.openwebtorrent.com`;
