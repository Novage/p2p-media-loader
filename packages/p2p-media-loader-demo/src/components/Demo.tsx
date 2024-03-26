import React, { useEffect, useRef } from "react";
import type Hls from "hls.js";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { PlaybackOptions } from "./PlaybackOptions";
import { PLAYERS } from "../constants";
import "./demo.css";
import { useQueryParams } from "../hooks/useQueryParams";
declare global {
  interface Window {
    Hls: typeof Hls;
    videoPlayer?: { destroy?: () => void };
  }
}

export type Player = (typeof PLAYERS)[number];

const HlsWithP2P = HlsJsP2PEngine.injectMixin(window.Hls);

export const Demo = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const { queryParams, setURLQueryParams } = useQueryParams<
    "player" | "streamUrl"
  >();

  const handlePlaybackOptionsUpdate = (url: string, player: string) => {
    if (!PLAYERS.includes(player as Player)) return;
    setURLQueryParams({ streamUrl: url, player });
  };

  useEffect(() => {
    const createNewPlayer = (url: string) => {
      let cleanUpFn = () => {};

      const initHlsJsPlayer = (url: string) => {
        if (!videoRef.current) return;
        const hls = new HlsWithP2P();

        hls.attachMedia(videoRef.current);
        hls.loadSource(url);

        cleanUpFn = () => {
          hls.destroy();
        };
      };

      switch (queryParams.player) {
        case "hlsjs":
          initHlsJsPlayer(url);
          break;
        default:
          break;
      }

      return cleanUpFn;
    };

    if (!queryParams.streamUrl) return;

    const cleanUpFn = createNewPlayer(queryParams.streamUrl);

    return cleanUpFn;
  }, [queryParams.player, queryParams.streamUrl]);

  return (
    <>
      <div ref={videoContainerRef} className="video-container">
        <video ref={videoRef} autoPlay controls style={{ width: 800 }} />
      </div>
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
