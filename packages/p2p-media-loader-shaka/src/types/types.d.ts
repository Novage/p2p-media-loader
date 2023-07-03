export type StreamProtocol = "hls" | "dash";

export type StreamInfo = {
  protocol?: StreamProtocol;
};

export type StreamType = "video" | "audio";

type ByteRange = { start: number; end: number };

type HookedStream = shaka.extern.Stream & {
  streamUrl?: string;
  mediaSequenceTimeMap?: Map<number, number>;
};

export type Shaka = {
  media: { ManifestParser: typeof shaka.media.ManifestParser };
  net: {
    NetworkingEngine: typeof shaka.net.NetworkingEngine;
    HttpFetchPlugin: typeof shaka.net.HttpFetchPlugin;
  };
  hls: { HlsParser: typeof shaka.hls.HlsParser };
  dash: { DashParser: typeof shaka.dash.DashParser };
};
