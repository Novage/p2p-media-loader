import type Hls from "hls.js";
import { PlaybackOptions } from "./PlaybackOptions";
import { PLAYERS } from "../constants";
import "./demo.css";
import { useQueryParams } from "../hooks/useQueryParams";
import { HlsjsPlayer } from "./players/Hlsjs";
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

  const handlePlaybackOptionsUpdate = (url: string, player: string) => {
    if (!PLAYERS.includes(player as Player)) return;
    setURLQueryParams({ streamUrl: url, player });
  };

  const renderPlayer = () => {
    switch (queryParams.player) {
      case "hlsjs":
        return <HlsjsPlayer streamUrl={queryParams.streamUrl} />;
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
    </>
  );
};
