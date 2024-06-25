/// <reference types="./declarations.d.ts" />

import { BandwidthCalculator } from "./bandwidth-calculator";

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
