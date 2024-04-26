import { useEffect, useRef, useState } from "react";
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
  const [isShakaSupported, setIsShakaSupported] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ShakaP2PEngine.registerPlugins(shaka);
    return () => ShakaP2PEngine.unregisterPlugins(shaka);
  }, []);

  useEffect(() => {
    if (!shaka.Player.isBrowserSupported()) {
      setIsShakaSupported(false);
      return;
    }

    let isCleanedUp = false;

    let shakaP2PEngine: ShakaP2PEngine | undefined;
    let player: shaka.Player | undefined;
    let ui: shaka.ui.Overlay | undefined;

    const cleanup = () => {
      isCleanedUp = true;
      void player?.destroy();
      player = undefined;
      shakaP2PEngine?.destroy();
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

  return isShakaSupported ? (
    <div ref={videoContainerRef} className="video-container">
      <video ref={videoRef} autoPlay className="video-player" />
    </div>
  ) : (
    <div className="error-message">
      <h3>Shaka Player is not supported in this browser</h3>
    </div>
  );
};
