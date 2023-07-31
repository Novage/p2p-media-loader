export type StreamProtocol = "hls" | "dash";

export type StreamInfo = {
  protocol?: StreamProtocol;
  isLive: boolean;
};

export type StreamType = "video" | "audio";

type ByteRange = { start: number; end: number };

type HookedStream = shaka.extern.Stream & {
  streamUrl?: string;
  mediaSequenceTimeMap?: Map<number, number>;
};

export type Shaka = typeof window.shaka;
