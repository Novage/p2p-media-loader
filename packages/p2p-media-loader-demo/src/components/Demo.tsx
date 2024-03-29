import type Hls from "hls.js";
import { PlaybackOptions } from "./PlaybackOptions";
import { PLAYERS } from "../constants";
import { useQueryParams } from "../hooks/useQueryParams";
import { HlsjsPlayer } from "./players/Hlsjs";
import { GraphNetwork } from "./GraphNetwork";
import "./demo.css";
import { useCallback, useState } from "react";
import { MovingLineChart } from "./StatsChart";

declare global {
  interface Window {
    Hls: typeof Hls;
    videoPlayer?: { destroy?: () => void };
  }
}

export type Player = (typeof PLAYERS)[number];

export const Demo = () => {
  //const [data, setData] = useState<DataItem[]>([]);
  const { queryParams, setURLQueryParams } = useQueryParams<
    "player" | "streamUrl"
  >();
  const [peers, setPeers] = useState<string[]>([]);

  /*useEffect(() => {
    const interval = setInterval(() => {
      const newData: DataItem = {
        date: new Date(),
        value: Math.random() * 100,
      };
      setData((currentData) => [...currentData, newData].slice(-50)); // Keep last 50 data points
    }, 1000);

    return () => clearInterval(interval);
  }, []);*/

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
      <MovingLineChart />;
    </>
  );
};
