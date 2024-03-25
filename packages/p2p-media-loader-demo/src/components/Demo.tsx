import React, { useCallback, useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { GraphCanvas, GraphEdge, GraphNode } from "reagraph";
import "./demo.css";
import { PlaybackOptions } from "./PlaybackOptions";

declare global {
  interface Window {
    Hls: typeof Hls;
    videoPlayer?: { destroy?: () => void };
  }
}

const players = ["hlsjs", "hlsjs-dplayer"] as const;
type Player = (typeof players)[number];

type GraphState = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

const HlsWithP2P = HlsJsP2PEngine.injectMixin(window.Hls);

const stream = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
const defaultGraphState: GraphState = {
  nodes: [
    {
      id: "0",
      label: "You",
    },
  ],
  edges: [],
};

export const Demo = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [graphState, setGraphState] = useState<GraphState>(defaultGraphState);

  const handlePlaybackOptionsUpdate = (url: string, player: string) => {
    const playerType = player as Player;

    if (!players.includes(playerType)) return;

    const newUrl = `${window.location.pathname}?streamUrl=${encodeURIComponent(url)}&player=${encodeURIComponent(player)}`;

    window.history.pushState({}, "", newUrl);

    setStreamUrl(url);
    setPlayer(playerType);
  };

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const playerTypeParam = searchParams.get("player") as Player | null;
    const streamUrlParam = searchParams.get("streamUrl");

    setPlayer(
      playerTypeParam && players.includes(playerTypeParam)
        ? playerTypeParam
        : "hlsjs",
    );
    setStreamUrl(streamUrlParam ? streamUrlParam : stream);

    const createNewPlayer = (url: string) => {
      const initHlsJsPlayer = (url: string) => {
        if (!videoRef.current) return;
        const hls = new HlsWithP2P();

        hls.p2pEngine.addEventListener("onPeerConnect", (peerId) => {
          setGraphState((prev) => ({
            nodes: [
              ...prev.nodes,
              {
                id: peerId,
                label: peerId,
              },
            ],
            edges: [
              ...prev.edges,
              {
                id: `${peerId}`,
                source: "0",
                target: peerId,
              },
            ],
          }));
        });

        hls.p2pEngine.addEventListener("onPeerClose", (peerId) => {
          setGraphState((prev) => ({
            nodes: prev.nodes.filter((node) => node.id !== peerId),
            edges: prev.edges.filter((edge) => edge.target !== peerId),
          }));
        });

        hls.attachMedia(videoRef.current);
        hls.loadSource(url);

        window.videoPlayer = hls;
      };

      window.videoPlayer?.destroy?.();

      switch (player) {
        case "hlsjs":
          initHlsJsPlayer(url);
          break;
        default:
          break;
      }
    };

    if (!streamUrl) return;
    createNewPlayer(streamUrl);
  }, [player, streamUrl]);

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
