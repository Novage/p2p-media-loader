import { useEffect, useRef, useState } from "react";
import { ShakaP2PEngine } from "p2p-media-loader-shaka";
import { PlayerProps } from "../../../types";
import "shaka-player/dist/controls.css";
import shaka from "./shaka-import";
import { subscribeToUiEvents } from "../utils";

export const Shaka = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const [isShakaSupported, setIsShakaSupported] = useState(true);

  const playerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ShakaP2PEngine.registerPlugins(shaka);
    return () => ShakaP2PEngine.unregisterPlugins(shaka);
  }, []);

  useEffect(() => {
    if (!playerContainerRef.current) return;
    if (!shaka.Player.isBrowserSupported()) {
      setIsShakaSupported(false);
      return;
    }

    const { newVideoElement, newVideoContainer } = createVideoElement();

    playerContainerRef.current.appendChild(newVideoContainer);

    let isCleanedUp = false;
    let shakaP2PEngine: ShakaP2PEngine | undefined;
    let player: shaka.Player | undefined;
    let ui: shaka.ui.Overlay | undefined;

    const cleanup = () => {
      isCleanedUp = true;
      newVideoElement.remove();
      newVideoContainer.remove();
      void player?.destroy();
      void ui?.destroy();
      shakaP2PEngine?.destroy();
    };

    const setupPlayer = async () => {
      const playerInit = new shaka.Player();
      const uiInit = new shaka.ui.Overlay(
        playerInit,
        newVideoContainer,
        newVideoElement,
      );

      const shakaP2PEngineInit = new ShakaP2PEngine(
        {
          core: {
            announceTrackers,
          },
        },
        shaka,
      );

      try {
        await playerInit.attach(newVideoElement);

        subscribeToUiEvents({
          engine: shakaP2PEngineInit,
          onPeerConnect,
          onPeerDisconnect,
          onChunkDownloaded,
          onChunkUploaded,
        });

        player = playerInit;
        ui = uiInit;
        shakaP2PEngine = shakaP2PEngineInit;
      } catch (error) {
        player = playerInit;
        ui = uiInit;
        shakaP2PEngine = shakaP2PEngineInit;
        // eslint-disable-next-line no-console
        console.error("Error setting up Shaka Player:", error);
        cleanup();
        throw error;
      }

      if (isCleanedUp) {
        cleanup();
        return;
      }

      shakaP2PEngineInit.configureAndInitShakaPlayer(playerInit);
      await playerInit.load(streamUrl);
    };

    void setupPlayer();

    return cleanup;
  }, [
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerDisconnect,
    streamUrl,
  ]);

  return isShakaSupported ? (
    <div ref={playerContainerRef}></div>
  ) : (
    <div className="error-message">
      <h3>Shaka Player is not supported in this browser</h3>
    </div>
  );
};

const createVideoElement = () => {
  const newVideoElement = document.createElement("video");
  newVideoElement.playsInline = true;
  newVideoElement.autoplay = true;
  newVideoElement.muted = true;
  newVideoElement.style.aspectRatio = "auto";

  const newVideoContainer = document.createElement("div");
  newVideoContainer.appendChild(newVideoElement);

  return { newVideoElement, newVideoContainer };
};
