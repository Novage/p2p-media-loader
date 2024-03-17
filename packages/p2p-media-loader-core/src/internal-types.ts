/// <reference types="./declarations.d.ts" />

import { BandwidthCalculator } from "./bandwidth-calculator";
import { Segment as SegmentBase, Stream } from "./types";

export type Playback = {
  position: number;
  rate: number;
};

export type BandwidthCalculators = Readonly<{
  all: BandwidthCalculator;
  http: BandwidthCalculator;
}>;

export type StreamDetails = {
  isLive: boolean;
  activeLevelBitrate: number;
};

export type Segment = SegmentBase & {
  readonly stream: StreamWithSegments;
};

export type StreamWithSegments<TStream = Stream> = TStream & {
  readonly segments: Map<string, Segment>;
};
