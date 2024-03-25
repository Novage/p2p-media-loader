import React, { useEffect, useMemo, useRef, useState } from "react";
import type Hls from "hls.js";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { GraphCanvas, GraphEdge, GraphNode } from "reagraph";
import { PlaybackOptions } from "./PlaybackOptions";
import {
  PLAYERS,
  DEFAULT_GRAPH_STATE,
  DEFAULT_STREAM,
  DEFAULT_PLAYER,
} from "../constants";
import "./demo.css";
declare global {
  interface Window {
    Hls: typeof Hls;
    videoPlayer?: { destroy?: () => void };
  }
}

type Player = (typeof PLAYERS)[number];

type GraphState = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

const HlsWithP2P = HlsJsP2PEngine.injectMixin(window.Hls);

export const Demo = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [graphState, setGraphState] = useState<GraphState>(DEFAULT_GRAPH_STATE);
  const searchParams = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );

  const handlePlaybackOptionsUpdate = (url: string, player: string) => {
    const playerType = player as Player;

    if (!PLAYERS.includes(playerType)) return;

    const newUrl = `${window.location.pathname}?streamUrl=${encodeURIComponent(url)}&player=${encodeURIComponent(player)}`;

    window.history.pushState({}, "", newUrl);

    setStreamUrl(url);
    setPlayer(playerType);
  };

  useEffect(() => {
    const playerTypeParam = searchParams.get("player") as Player | null;
    const streamUrlParam = searchParams.get("streamUrl");

    setPlayer(
      playerTypeParam && PLAYERS.includes(playerTypeParam)
        ? playerTypeParam
        : DEFAULT_PLAYER,
    );
    setStreamUrl(streamUrlParam ? streamUrlParam : DEFAULT_STREAM);

    const createNewPlayer = (url: string) => {
      let cleanUpFn = () => {};

      const onPeerConnect = (peerId: string) => {
        setGraphState((prev) => ({
          nodes: [...prev.nodes, { id: peerId, label: peerId }],
          edges: [
            ...prev.edges,
            { id: `${peerId}`, source: "0", target: peerId },
          ],
        }));
      };

      const onPeerClose = (peerId: string) => {
        setGraphState((prev) => ({
          nodes: prev.nodes.filter((node) => node.id !== peerId),
          edges: prev.edges.filter((edge) => edge.target !== peerId),
        }));
      };

      const initHlsJsPlayer = (url: string) => {
        if (!videoRef.current) return;
        const hls = new HlsWithP2P();

        hls.p2pEngine.addEventListener("onPeerConnect", onPeerConnect);
        hls.p2pEngine.addEventListener("onPeerClose", onPeerClose);

        hls.attachMedia(videoRef.current);
        hls.loadSource(url);

        cleanUpFn = () => {
          hls.destroy();
        };
      };

      switch (player) {
        case "hlsjs":
          initHlsJsPlayer(url);
          break;
        default:
          break;
      }

      return cleanUpFn;
    };

    if (!streamUrl) return;
    const cleanUpFn = createNewPlayer(streamUrl);

    return cleanUpFn;
  }, [player, searchParams, streamUrl]);

  return (
    <>
      <div className="video-container">
        <video ref={videoRef} autoPlay controls style={{ width: 800 }} />
      </div>
      <div style={{ display: "flex" }}>
        <div className="graph-container">
          <GraphCanvas
            nodes={graphState.nodes}
            edges={graphState.edges}
            cameraMode="rotate"
            edgeArrowPosition="none"
          />
        </div>
        <PlaybackOptions updatePlaybackOptions={handlePlaybackOptionsUpdate} />
      </div>
    </>
  );
};
