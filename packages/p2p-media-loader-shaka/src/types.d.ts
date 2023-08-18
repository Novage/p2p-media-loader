import type { Stream as CoreStream } from "p2p-media-loader-core";

export type StreamProtocol = "hls" | "dash";

export type StreamInfo = {
  protocol?: StreamProtocol;
  manifestResponseUrl?: string;
};

type HookedStream = shaka.extern.Stream & {
  streamUrl?: string;
  mediaSequenceTimeMap?: Map<number, number>;
};

export type Stream = CoreStream & {
  shakaStream: HookedStream;
};

export type Shaka = typeof window.shaka;
