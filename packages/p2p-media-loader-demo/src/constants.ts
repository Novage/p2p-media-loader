export const PLAYERS = ["hlsjs", "hlsjs-dplayer"] as const;
export const DEFAULT_STREAM =
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
//"https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8";
export const NETWORK_GRAPH_OPTIONS = {
  nodes: {
    shape: "dot",
    size: 20,
    font: {
      size: 12,
    },
    borderWidth: 1,
    shadow: true,
  },
  edges: {
    width: 1,
    shadow: true,
  },
};
export const DEFAULT_GRAPH_DATA = {
  nodes: [{ id: 1, label: "You", color: "#5390e0" }],
  edges: [],
};
export const COLORS = {
  yellow: "#faf21b",
  lightOrange: "#ff7f0e",
  lightBlue: "#ADD8E6",
  torchRed: "#ff1745",
};
export const DEFAULT_TRACKERS = `wss://tracker.webtorrent.dev,
  wss://tracker.files.fm:7073/announce,
  wss://tracker.openwebtorrent.com`;
