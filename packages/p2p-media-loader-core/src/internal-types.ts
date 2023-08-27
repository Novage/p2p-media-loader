export type Playback = {
  position: number;
  rate: number;
  lastPositionUpdate: "moved-forward" | "moved-backward";
};
