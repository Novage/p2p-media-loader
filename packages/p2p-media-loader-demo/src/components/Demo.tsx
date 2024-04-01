import type Hls from "hls.js";
import { PlaybackOptions } from "./PlaybackOptions";
import { PLAYERS } from "../constants";
import { useQueryParams } from "../hooks/useQueryParams";
import { HlsjsPlayer } from "./players/Hlsjs";
import { GraphNetwork } from "./GraphNetwork";
import "./demo.css";
import { useCallback, useRef, useState } from "react";
import { MovingStackedAreaChart } from "./StatsChart";

declare global {
  interface Window {
    Hls: typeof Hls;
    videoPlayer?: { destroy?: () => void };
  }
}

const convertToMB = (bytes: number) => bytes / 1024 / 1024;

type DownloadStats = {
  series1: number;
  series2: number;
  series3: number;
};

export type Player = (typeof PLAYERS)[number];

export const Demo = () => {
  const data = useRef<DownloadStats>({
    series1: 0,
    series2: 0,
    series3: 0,
  });
  const { queryParams, setURLQueryParams } = useQueryParams<
    "player" | "streamUrl"
  >();
  const [peers, setPeers] = useState<string[]>([]);

  const onChunkDownloaded = useCallback(
    (bytesLength: number, downloadSource: string) => {
      switch (downloadSource) {
        case "http":
          data.current.series1 += convertToMB(bytesLength);
          break;
        case "p2p":
          data.current.series2 += convertToMB(bytesLength);
          break;
        default:
          break;
      }
    },
    [],
  );

  const onChunkUploaded = useCallback((bytesLength: number) => {
    data.current.series3 += convertToMB(bytesLength);
  }, []);

  const onPeerConnect = useCallback((peerId: string) => {
    setPeers((peers) => {
      return [...peers, peerId];
    });
  }, []);

  const onPeerDisconnect = useCallback((peerId: string) => {
    setPeers((peers) => {
      return peers.filter((peer) => peer !== peerId);
    });
  }, []);

  const handlePlaybackOptionsUpdate = (url: string, player: string) => {
    if (!PLAYERS.includes(player as Player)) return;
    setURLQueryParams({ streamUrl: url, player });
  };

  const renderPlayer = () => {
    switch (queryParams.player) {
      case "hlsjs":
        return (
          <HlsjsPlayer
            streamUrl={queryParams.streamUrl}
            onPeerConnect={onPeerConnect}
            onPeerDisconnect={onPeerDisconnect}
            onChunkDownloaded={onChunkDownloaded}
            onChunkUploaded={onChunkUploaded}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      {renderPlayer()}
      <div style={{ display: "flex" }}>
        <PlaybackOptions
          updatePlaybackOptions={handlePlaybackOptionsUpdate}
          currentPlayer={queryParams.player}
          streamUrl={queryParams.streamUrl}
        />
      </div>
      <GraphNetwork peers={peers} />
      <MovingStackedAreaChart downloadStatsRef={data} />
    </>
  );
};
