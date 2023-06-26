export type StreamProtocol = "hls" | "dash";

export type StreamInfo = {
  protocol?: StreamProtocol;
  lastLoadedStreamUrl?: string;
  readonly mediaSequence: { video: number; audio: number };
};
