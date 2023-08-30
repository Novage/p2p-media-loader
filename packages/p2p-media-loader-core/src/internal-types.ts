export type Playback = {
  position: number;
  rate: number;
  lastPositionUpdate: "moved-forward" | "moved-backward";
};

export type SegmentLoadStatus =
  | "high-demand"
  | "http-downloadable"
  | "p2p-downloadable";
