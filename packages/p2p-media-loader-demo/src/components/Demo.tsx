import type Hls from "hls.js";
import { PlaybackOptions } from "./PlaybackOptions";
import { PLAYERS } from "../constants";
import { useQueryParams } from "../hooks/useQueryParams";
import { HlsjsPlayer } from "./players/Hlsjs";
import { GraphNetwork } from "./GraphNetwork";
import "./demo.css";
import { Data } from "vis-network";
import { useCallback, useState } from "react";

declare global {
  interface Window {
    Hls: typeof Hls;
    videoPlayer?: { destroy?: () => void };
  }
}

export type Player = (typeof PLAYERS)[number];

export const Demo = () => {
  const { queryParams, setURLQueryParams } = useQueryParams<
    "player" | "streamUrl"
  >();
  const [graphData, setGraphData] = useState<Data>({
    nodes: [{ id: 1, label: "You", color: "#5390e0" }],
    edges: [],
  });

  const onPeerConnect = useCallback((peerId: string) => {
    setGraphData((data) => {
      const newNode = { id: peerId, label: peerId, color: "#d8eb34" };
      const newEdge = { from: 1, to: peerId };

      const updatedNodes =
        data.nodes instanceof Array ? [...data.nodes, newNode] : data.nodes;
      const updatedEdges =
        data.edges instanceof Array ? [...data.edges, newEdge] : data.edges;

      return { ...data, nodes: updatedNodes, edges: updatedEdges };
    });
  }, []);

  const onPeerDisconnect = useCallback((peerId: string) => {
    setGraphData((data) => {
      const updatedNodes =
        data.nodes instanceof Array
          ? data.nodes.filter((node) => node.id !== peerId)
          : data.nodes;

      const updatedEdges =
        data.edges instanceof Array
          ? data.edges.filter(
              (edge) => edge.from !== peerId && edge.to !== peerId,
            )
          : data.edges;

      return { ...data, nodes: updatedNodes, edges: updatedEdges };
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
      <GraphNetwork data={graphData} />
    </>
  );
};
