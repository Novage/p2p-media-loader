import { useEffect, useRef } from "react";
import { ShakaP2PEngine } from "p2p-media-loader-shaka";
import { PlayerProps } from "../../../types";

import "shaka-player/dist/controls.css";
import shaka from "./shaka-import";
import { configureShakaP2PEngineEvents } from "../utils";

export const Shaka = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ShakaP2PEngine.registerPlugins(shaka);
    return () => ShakaP2PEngine.unregisterPlugins(shaka);
  }, []);

  useEffect(() => {
    if (!videoRef.current || !videoContainerRef.current) return;

    const player = new shaka.Player();
    const ui = new shaka.ui.Overlay(
      player,
      videoContainerRef.current,
      videoRef.current,
    );

    const shakaP2PEngine = new ShakaP2PEngine(
      {
        core: {
          announceTrackers,
        },
      },
      shaka,
    );

    const setupPlayer = async () => {
      if (!videoRef.current) return;

      try {
        await player.attach(videoRef.current);

        configureShakaP2PEngineEvents({
          engine: shakaP2PEngine,
          onPeerConnect,
          onPeerDisconnect,
          onChunkDownloaded,
          onChunkUploaded,
        });

        shakaP2PEngine.configureAndInitShakaPlayer(player);
        await player.load(streamUrl);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Error setting up Shaka Player:", error);
      }
    };

    void setupPlayer();

    return () => {
      shakaP2PEngine.destroy();
      void player.destroy();
      void ui.destroy();
    };
  }, [
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerDisconnect,
    streamUrl,
  ]);

  return (
    <div ref={videoContainerRef} className="video-container">
      <video ref={videoRef} autoPlay className="video-player" />
    </div>
  );
};
