import "plyr/dist/plyr.css";
import { useEffect, useRef } from "react";
import shaka from "../shaka/shaka-import";
import { ShakaP2PEngine } from "p2p-media-loader-shaka";
import { PlayerProps } from "../../../types";
import Plyr, { Options } from "plyr";
import { createVideoElements, subscribeToUiEvents } from "../utils";

export const ShakaPlyr = ({
  streamUrl,
  announceTrackers,
  swarmId,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ShakaP2PEngine.registerPlugins(shaka);
    return () => ShakaP2PEngine.unregisterPlugins(shaka);
  }, []);

  useEffect(() => {
    if (!containerRef.current || !shaka.Player.isBrowserSupported()) return;

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
      plyrPlayer?.destroy();
      videoContainer.remove();
    };

    const initPlayer = async () => {
      const shakaP2PEngineInit = new ShakaP2PEngine(
        {
          core: {
            announceTrackers,
            swarmId,
          },
        },
        shaka,
      );
      const shakaPlayerInit = new shaka.Player();

      subscribeToUiEvents({
        engine: shakaP2PEngineInit,
        onPeerConnect,
        onPeerClose,
        onChunkDownloaded,
        onChunkUploaded,
      });

      try {
        await shakaPlayerInit.attach(videoElement);

        playerShaka = shakaPlayerInit;
        shakaP2PEngine = shakaP2PEngineInit;

        if (isCleanedUp) cleanup();
      } catch (error) {
        playerShaka = shakaPlayerInit;
        shakaP2PEngine = shakaP2PEngineInit;

        cleanup();
        // eslint-disable-next-line no-console
        console.error("Error attaching shaka player", error);
      }

      if (isCleanedUp) {
        cleanup();
        return;
      }

      shakaP2PEngineInit.bindShakaPlayer(shakaPlayerInit);
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

      plyrPlayer = new Plyr(videoElement, {
        quality,
        autoplay: true,
        muted: true,
      });
    };

    void initPlayer();

    return () => cleanup();
  }, [
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerClose,
    streamUrl,
    swarmId,
  ]);

  return shaka.Player.isBrowserSupported() ? (
    <div ref={containerRef} />
  ) : (
    <div className="error-message">
      <h3>Shaka Player is not supported in this browser</h3>
    </div>
  );
};
