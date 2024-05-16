import "plyr/dist/plyr.css";
import { useEffect, useRef, useState } from "react";
import shaka from "../shaka/shaka-import";
import { ShakaP2PEngine } from "p2p-media-loader-shaka";
import { PlayerProps } from "../../../types";
import Plyr, { Options } from "plyr";
import { createVideoElements, subscribeToUiEvents } from "../utils";

export const ShakaPlyr = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const [isShakaSupported, setIsShakaSupported] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ShakaP2PEngine.registerPlugins(shaka);
    return () => ShakaP2PEngine.unregisterPlugins(shaka);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!shaka.Player.isBrowserSupported()) {
      setIsShakaSupported(false);
      return;
    }

    const { videoContainer, videoElement } = createVideoElements();

    containerRef.current.appendChild(videoContainer);

    let plyrPlayer: Plyr | undefined;
    let playerShaka: shaka.Player | undefined;
    let shakaP2PEngine: ShakaP2PEngine | undefined;
    let isCleanedUp = false;

    const cleanup = () => {
      isCleanedUp = true;
      shakaP2PEngine?.destroy();
      void playerShaka?.destroy();
      void plyrPlayer?.destroy();
      videoContainer.remove();
    };

    const initPlayer = async () => {
      try {
        const shakaP2PEngineInit = new ShakaP2PEngine(
          {
            core: {
              announceTrackers,
            },
          },
          shaka,
        );
        const shakaPlayerInit = new shaka.Player();

        await shakaPlayerInit.attach(videoElement);

        subscribeToUiEvents({
          engine: shakaP2PEngineInit,
          onPeerConnect,
          onPeerDisconnect,
          onChunkDownloaded,
          onChunkUploaded,
        });
        shakaP2PEngineInit.configureAndInitShakaPlayer(shakaPlayerInit);

        await shakaPlayerInit.load(streamUrl);

        const levels = shakaPlayerInit.getVariantTracks();

        const quality: Options["quality"] = {
          default: levels[levels.length - 1]?.height ?? 0,
          options: levels
            .map((level) => level.height)
            .filter((height): height is number => height != null)
            .sort((a, b) => a - b),
          forced: true,
          onChange: (newQuality: number) => {
            levels.forEach((level) => {
              if (level.height === newQuality) {
                shakaPlayerInit.configure({
                  abr: { enabled: false },
                });
                shakaPlayerInit.selectVariantTrack(level, true);
              }
            });
          },
        };

        const plyrPlayerInit = new Plyr(videoElement, {
          quality,
          autoplay: true,
          muted: true,
        });

        playerShaka = shakaPlayerInit;
        plyrPlayer = plyrPlayerInit;
        shakaP2PEngine = shakaP2PEngineInit;

        if (isCleanedUp) cleanup();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Error setting up Shaka Player:", error);
        cleanup();
      }
    };

    void initPlayer();

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
    <div ref={containerRef} />
  ) : (
    <div className="error-message">
      <h3>Shaka Player is not supported in this browser</h3>
    </div>
  );
};
