import "./openPlayer.css";
import { useEffect, useRef } from "react";
import OpenPlayerJS from "openplayerjs";
import { PlayerProps } from "../../../types";
import { getConfiguredHlsInstance } from "../utils";

export const HlsjsOpenPlayer = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<OpenPlayerJS | null>(null);

  useEffect(() => {
    if (!playerContainerRef.current) return;

    const videoContainer = document.createElement("div");
    videoContainer.className = "video-container";
    playerContainerRef.current.appendChild(videoContainer);

    const videoElement = document.createElement("video");
    videoElement.className = "op-player__media";
    videoElement.id = "player";
    videoContainer.appendChild(videoElement);

    const initPlayer = async () => {
      if (!videoElement) return;

      try {
        playerRef.current = new OpenPlayerJS(videoElement, {
          controls: {
            layers: {
              left: ["play", "time", "volume"],
              right: ["settings", "fullscreen", "levels"],
              middle: ["progress"],
            },
          },
        });

        await playerRef.current.init();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to initialize OpenPlayerJS", error);
      }
    };

    const hls = getConfiguredHlsInstance({
      announceTrackers,
      onPeerConnect,
      onPeerDisconnect,
      onChunkDownloaded,
      onChunkUploaded,
    });

    hls.attachMedia(videoElement);
    hls.loadSource(streamUrl);

    void initPlayer();

    return () => {
      hls.destroy();
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      videoElement.remove();
      videoContainer.remove();
    };
  }, [
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerDisconnect,
    streamUrl,
  ]);

  return <div ref={playerContainerRef} className="player-container"></div>;
};
