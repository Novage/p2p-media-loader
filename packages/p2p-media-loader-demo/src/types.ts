import { PLAYERS } from "./constants";
import { CoreEventMap } from "p2p-media-loader-core";

export type DownloadStats = {
  httpDownloaded: number;
  p2pDownloaded: number;
  p2pUploaded: number;
};

export type SvgDimensionsType = {
  width: number;
  height: number;
};

export type ChartsData = {
  seconds: number;
} & DownloadStats;

export type PlayerKey = keyof typeof PLAYERS;
export type PlayerName = (typeof PLAYERS)[PlayerKey];

export type PlayerProps = {
  streamUrl: string;
  announceTrackers: string[];
  swarmId?: string;
} & Partial<
  Pick<
    CoreEventMap,
    "onPeerConnect" | "onChunkDownloaded" | "onChunkUploaded" | "onPeerClose"
  >
>;

export type PlayerEvents = Omit<
  PlayerProps,
  "streamUrl" | "announceTrackers" | "swarmId"
>;
