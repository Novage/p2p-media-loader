import { GraphData } from "./components/Demo";

export const PLAYERS = ["hlsjs", "hlsjs-dplayer"] as const;
export const DEFAULT_STREAM =
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
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
export const DEFAULT_GRAPH_DATA: GraphData = {
  nodes: [{ id: 1, label: "You", color: "#5390e0" }],
  edges: [],
};
