/// <reference types="./declarations.d.ts" />

import { DeepReadonly } from "ts-essentials";
import { BandwidthCalculator } from "./bandwidth-calculator";
import { CoreConfig } from "./types";

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

export type ReadonlyCoreConfig = DeepReadonly<CoreConfig>;
