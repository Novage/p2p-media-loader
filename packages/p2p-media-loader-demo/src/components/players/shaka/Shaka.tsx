import { useEffect, useRef, useState } from "react";
import { ShakaP2PEngine } from "p2p-media-loader-shaka";
import { PlayerProps } from "../../../types";
import "shaka-player/dist/controls.css";
import shaka from "./shaka-import";
import { createVideoElements, subscribeToUiEvents } from "../utils";

export const Shaka = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerClose,
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

    const { videoElement, videoContainer } = createVideoElements({
      aspectRatio: "auto",
    });

    playerContainerRef.current.appendChild(videoContainer);

    let isCleanedUp = false;
    let shakaP2PEngine: ShakaP2PEngine | undefined;
    let player: shaka.Player | undefined;
    let ui: shaka.ui.Overlay | undefined;

    const cleanup = () => {
      isCleanedUp = true;
      videoElement.remove();
      videoContainer.remove();
      void player?.destroy();
      void ui?.destroy();
      shakaP2PEngine?.destroy();
    };

    const setupPlayer = async () => {
      const playerInit = new shaka.Player();
      const uiInit = new shaka.ui.Overlay(
        playerInit,
        videoContainer,
        videoElement,
      );

      const shakaP2PEngineInit = new ShakaP2PEngine(
        {
          core: {
            announceTrackers,
          },
        },
        shaka,
      );

      subscribeToUiEvents({
        engine: shakaP2PEngineInit,
        onPeerConnect,
        onPeerClose,
        onChunkDownloaded,
        onChunkUploaded,
      });

      try {
        await playerInit.attach(videoElement);

        player = playerInit;
        ui = uiInit;
        shakaP2PEngine = shakaP2PEngineInit;
      } catch (error) {
        player = playerInit;
        ui = uiInit;
        shakaP2PEngine = shakaP2PEngineInit;

        cleanup();
        // eslint-disable-next-line no-console
        console.error("Error attaching shaka player", error);
      }

      if (isCleanedUp) {
        cleanup();
        return;
      }

      shakaP2PEngineInit.bindShakaPlayer(playerInit);
      await playerInit.load(streamUrl);
    };

    void setupPlayer();

    return cleanup;
  }, [
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerClose,
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
