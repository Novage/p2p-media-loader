import "./demo.css";
import type Hls from "hls.js";
import { PlaybackOptions } from "./PlaybackOptions";
import { PLAYERS } from "../constants";
import { useQueryParams } from "../hooks/useQueryParams";
import { HlsjsPlayer } from "./players/hlsjs/Hlsjs";
import { useCallback, useMemo, useRef, useState } from "react";
import { DownloadStatsChart } from "./chart/DownloadStatsChart";
import { NodeNetwork } from "./nodeNetwork/NodeNetwork";
import { DebugTools } from "./debugTools/DebugTools";
import { DownloadStats, PlayerKey } from "../types";
import { HlsjsDPlayer } from "./players/hlsjs/HlsjsDPLayer";
import { HlsjsClapprPlayer } from "./players/hlsjs/HlsjsClapprPlayer";
import { HlsjsVime } from "./players/hlsjs/HlsjsVime";
import { HlsjsPlyr } from "./players/hlsjs/HlsjsPlyr";
import { HlsjsOpenPlayer } from "./players/hlsjs/HlsjsOpenPlayer";
import { Shaka } from "./players/shaka/Shaka";
import { ShakaDPlayer } from "./players/shaka/ShakaDPlayer";

declare global {
  interface Window {
    Hls: typeof Hls;
    videoPlayer?: { destroy?: () => void };
  }
}

type DemoProps = {
  debugToolsEnabled?: boolean;
};

export const P2PVideoDemo = ({ debugToolsEnabled }: DemoProps) => {
  const data = useRef<DownloadStats>({
    httpDownloaded: 0,
    p2pDownloaded: 0,
    p2pUploaded: 0,
  });

  const { queryParams, setURLQueryParams } = useQueryParams();

  const trackers = useMemo(
    () => queryParams.trackers.split(","),
    [queryParams.trackers],
  );

  const [peers, setPeers] = useState<string[]>([]);

  const onChunkDownloaded = useCallback(
    (bytesLength: number, downloadSource: string) => {
      switch (downloadSource) {
        case "http":
          data.current.httpDownloaded += bytesLength;
          break;
        case "p2p":
          data.current.p2pDownloaded += bytesLength;
          break;
        default:
          break;
      }
    },
    [],
  );

  const onChunkUploaded = useCallback((bytesLength: number) => {
    data.current.p2pUploaded += bytesLength;
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
    if (!(player in PLAYERS)) return;
    setURLQueryParams({ streamUrl: url, player });
  };

  const renderPlayer = () => {
    switch (queryParams.player as PlayerKey) {
      case "openPlayer_hls":
        return (
          <HlsjsOpenPlayer
            streamUrl={queryParams.streamUrl}
            announceTrackers={trackers}
            onPeerConnect={onPeerConnect}
            onPeerDisconnect={onPeerDisconnect}
            onChunkDownloaded={onChunkDownloaded}
            onChunkUploaded={onChunkUploaded}
          />
        );

      case "plyr_hls":
        return (
          <HlsjsPlyr
            streamUrl={queryParams.streamUrl}
            announceTrackers={trackers}
            onPeerConnect={onPeerConnect}
            onPeerDisconnect={onPeerDisconnect}
            onChunkDownloaded={onChunkDownloaded}
            onChunkUploaded={onChunkUploaded}
          />
        );

      case "vime_hls":
        return (
          <HlsjsVime
            streamUrl={queryParams.streamUrl}
            announceTrackers={trackers}
            onPeerConnect={onPeerConnect}
            onPeerDisconnect={onPeerDisconnect}
            onChunkDownloaded={onChunkDownloaded}
            onChunkUploaded={onChunkUploaded}
          />
        );

      case "clappr_hls":
        return (
          <HlsjsClapprPlayer
            streamUrl={queryParams.streamUrl}
            announceTrackers={trackers}
            onPeerConnect={onPeerConnect}
            onPeerDisconnect={onPeerDisconnect}
            onChunkDownloaded={onChunkDownloaded}
            onChunkUploaded={onChunkUploaded}
          />
        );

      case "dplayer_hls":
        return (
          <HlsjsDPlayer
            streamUrl={queryParams.streamUrl}
            announceTrackers={trackers}
            onPeerConnect={onPeerConnect}
            onPeerDisconnect={onPeerDisconnect}
            onChunkDownloaded={onChunkDownloaded}
            onChunkUploaded={onChunkUploaded}
          />
        );

      case "hlsjs_hls":
        return (
          <HlsjsPlayer
            streamUrl={queryParams.streamUrl}
            announceTrackers={trackers}
            onPeerConnect={onPeerConnect}
            onPeerDisconnect={onPeerDisconnect}
            onChunkDownloaded={onChunkDownloaded}
            onChunkUploaded={onChunkUploaded}
          />
        );

      case "shaka":
        return (
          <Shaka
            streamUrl={queryParams.streamUrl}
            announceTrackers={trackers}
            onPeerConnect={onPeerConnect}
            onPeerDisconnect={onPeerDisconnect}
            onChunkDownloaded={onChunkDownloaded}
            onChunkUploaded={onChunkUploaded}
          />
        );

      case "dplayer_shaka":
        return (
          <ShakaDPlayer
            streamUrl={queryParams.streamUrl}
            announceTrackers={trackers}
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
      <div className="demo-container">
        <div className="column-1">
          {renderPlayer()}
          <DownloadStatsChart downloadStatsRef={data} />
        </div>

        <div className="column-2">
          <div style={{ display: "flex" }}>
            <PlaybackOptions
              updatePlaybackOptions={handlePlaybackOptionsUpdate}
              currentPlayer={queryParams.player}
              streamUrl={queryParams.streamUrl}
            />
          </div>

          <NodeNetwork peers={peers} />

          {trackers.length > 0 && (
            <div className="trackers-container">
              <span>Trackers:</span>
              <ul className="trackers-list">
                {trackers.map((tracker) => (
                  <li key={tracker}>{tracker}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      {debugToolsEnabled && <DebugTools />}
    </>
  );
};
