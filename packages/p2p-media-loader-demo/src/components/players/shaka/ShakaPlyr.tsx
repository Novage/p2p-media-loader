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
  const playerRef = useRef<Plyr | null>(null);

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

    const shakaP2PEngine = new ShakaP2PEngine(
      {
        core: {
          announceTrackers,
        },
      },
      shaka,
    );
    const shakaPlayer = new shaka.Player();

    const initPlayer = async () => {
      try {
        await shakaPlayer.attach(videoElement);
        configureShakaP2PEngineEvents({
          engine: shakaP2PEngine,
          onPeerConnect,
          onPeerDisconnect,
          onChunkDownloaded,
          onChunkUploaded,
        });
        shakaP2PEngine.configureAndInitShakaPlayer(shakaPlayer);
        await shakaPlayer.load(streamUrl);

        const levels = shakaPlayer.getVariantTracks();

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
                shakaPlayer.configure({
                  abr: { enabled: false },
                });
                shakaPlayer.selectVariantTrack(level, true);
              }
            });
          },
        };

        playerRef.current = new Plyr(videoElement, {
          autoplay: true,
          quality,
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Error setting up Shaka Player:", error);
      }
    };

    void initPlayer();

    return () => {
      videoContainer.remove();
      playerRef.current && playerRef.current.destroy();
      void shakaPlayer.destroy();
      shakaP2PEngine.destroy();
    };
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
