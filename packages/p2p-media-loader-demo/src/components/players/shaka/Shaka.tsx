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
    let shakaP2PEngine: ShakaP2PEngine | undefined;
    let player: shaka.Player | undefined;
    let ui: shaka.ui.Overlay | undefined;
    let isCleanedUp = false;

    const cleanup = () => {
      isCleanedUp = true;
      shakaP2PEngine?.destroy();
      void player?.destroy();
      player = undefined;
      void ui?.destroy();
    };

    const setupPlayer = async () => {
      if (!videoRef.current || !videoContainerRef.current) return;

      try {
        const playerInit = new shaka.Player();
        const uiInit = new shaka.ui.Overlay(
          playerInit,
          videoContainerRef.current,
          videoRef.current,
        );

        const shakaP2PEngineInit = new ShakaP2PEngine(
          {
            core: {
              announceTrackers,
            },
          },
          shaka,
        );

        await playerInit.attach(videoRef.current);

        configureShakaP2PEngineEvents({
          engine: shakaP2PEngineInit,
          onPeerConnect,
          onPeerDisconnect,
          onChunkDownloaded,
          onChunkUploaded,
        });

        shakaP2PEngineInit.configureAndInitShakaPlayer(playerInit);
        await playerInit.load(streamUrl);

        player = playerInit;
        ui = uiInit;
        shakaP2PEngine = shakaP2PEngineInit;

        if (isCleanedUp) cleanup();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Error setting up Shaka Player:", error);
        cleanup();
      }
    };

    void setupPlayer();

    return () => cleanup();
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
