import { PLAYERS } from "./constants";

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
  onPeerConnect?: (peerId: string) => void;
  onPeerDisconnect?: (peerId: string) => void;
  onChunkDownloaded?: (bytesLength: number, downloadSource: string) => void;
  onChunkUploaded?: (bytesLength: number) => void;
};
