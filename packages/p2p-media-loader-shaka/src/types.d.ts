import type { Stream as CoreStream, Core } from "p2p-media-loader-core";
import { SegmentManager } from "./segment-manager";

export type StreamProtocol = "hls" | "dash";

export type StreamInfo = {
  protocol?: StreamProtocol;
  manifestResponseUrl?: string;
};

type HookedStream = shaka.extern.Stream & {
  streamUrl?: string;
  mediaSequenceTimeMap?: Map<number, number>;
  isSegmentIndexAlreadyRead?: boolean;
};

export type Stream = CoreStream & {
  shakaStream: HookedStream;
};

export type Shaka = typeof window.shaka;

type P2PMLShakaData = {
  player: shaka.Player;
  core: Core<Stream>;
  shaka: Shaka;
  streamInfo: StreamInfo;
  segmentManager: SegmentManager;
};

export type HookedRequest = shaka.extern.Request & {
  p2pml?: P2PMLShakaData;
};

export type HookedNetworkingEngine = shaka.net.NetworkingEngine & {
  p2pml?: P2PMLShakaData;
};
