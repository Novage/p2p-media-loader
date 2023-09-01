export type Playback = {
  position: number;
  rate: number;
};

export type SegmentLoadStatus =
  | "high-demand"
  | "http-downloadable"
  | "p2p-downloadable";
