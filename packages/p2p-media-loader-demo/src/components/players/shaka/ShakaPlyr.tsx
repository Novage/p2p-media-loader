import "plyr/dist/plyr.css";
import { useEffect, useRef } from "react";
import shaka from "../shaka/shaka-import";
import { ShakaP2PEngine } from "p2p-media-loader-shaka";
import { PlayerProps } from "../../../types";
import Plyr, { Options } from "plyr";
import { configureShakaP2PEngineEvents } from "../utils";

export const ShakaPlyr = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ShakaP2PEngine.registerPlugins(shaka);
    return () => ShakaP2PEngine.unregisterPlugins(shaka);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const videoContainer = document.createElement("div");
    videoContainer.className = "video-container";
    containerRef.current.appendChild(videoContainer);

    const videoElement = document.createElement("video");
    videoElement.id = "player";
    videoContainer.appendChild(videoElement);

    let plyrPlayer: Plyr | undefined;
    let playerShaka: shaka.Player | undefined;
    let shakaP2PEngine: ShakaP2PEngine | undefined;
    let isCleanedUp = false;

    const cleanup = () => {
      isCleanedUp = true;
      shakaP2PEngine?.destroy();
      void playerShaka?.destroy();
      playerShaka = undefined;
      void plyrPlayer?.destroy();
      plyrPlayer = undefined;
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

        configureShakaP2PEngineEvents({
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
          autoplay: true,
          quality,
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

  return <div ref={containerRef} />;
};