export type StreamProtocol = "hls" | "dash";

export type StreamInfo = {
  protocol?: StreamProtocol;
  readonly mediaSequence: { video: number; audio: number };
};

export type StreamType = "video" | "audio";

type ByteRange = { offset: number; length?: number };

type HookedStream = shaka.extern.Stream & { streamUrl?: string };
