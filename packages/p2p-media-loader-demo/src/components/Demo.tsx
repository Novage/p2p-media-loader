import type Hls from "hls.js";
import { PlaybackOptions } from "./PlaybackOptions";
import { DEFAULT_STREAM, PLAYERS } from "../constants";
import "./demo.css";
import { HlsjsPlayer } from "./players/Hlsjs";
import { useEffect, useState } from "react";
declare global {
  interface Window {
    Hls: typeof Hls;
    videoPlayer?: { destroy?: () => void };
  }
}

export type Player = (typeof PLAYERS)[number];

export const Demo = () => {
  const [urlSearchParams, setURLSearchParams] = useState(
    new URLSearchParams(window.location.search),
  );
  const player = (urlSearchParams.get("player") as Player) || PLAYERS[0];
  const streamUrl = urlSearchParams.get("streamUrl") || DEFAULT_STREAM;

  useEffect(() => {
    const onPopState = () => {
      console.log("fired popstate");
      setURLSearchParams(new URLSearchParams(window.location.search));
    };

    console.log("adding popstate listener");
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const renderPlayer = () => {
    switch (player) {
      case "hlsjs":
        return <HlsjsPlayer streamUrl={streamUrl} />;
      default:
        return null;
    }
  };

  return (
    <>
      {renderPlayer()}
      <div style={{ display: "flex" }}>
        <PlaybackOptions currentPlayer={player} streamUrl={streamUrl} />
      </div>
    </>
  );
};
