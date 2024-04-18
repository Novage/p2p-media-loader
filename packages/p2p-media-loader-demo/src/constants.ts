export const PLAYERS = [
  "hlsjs",
  "hlsjs-dplayer",
  "hlsjs-clappr",
  "hlsjs-vime",
  "hlsjs-plyr",
  "hlsjs-openplayer",
] as const;
export const DEFAULT_STREAM =
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
export const COLORS = {
  yellow: "#faf21b",
  lightOrange: "#ff7f0e",
  lightBlue: "#ADD8E6",
  torchRed: "#ff1745",
};
export const DEFAULT_TRACKERS = `wss://tracker.webtorrent.dev,wss://tracker.files.fm:7073/announce,wss://tracker.openwebtorrent.com`;
