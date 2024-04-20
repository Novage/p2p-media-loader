import "./openPlayer.css";
import { useEffect, useRef } from "react";
import OpenPlayerJS from "openplayerjs";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { PlayerProps } from "../../../types";
import Hls from "hls.js";

const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);

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

    const hls = new HlsWithP2P({
      p2p: {
        core: {
          announceTrackers,
        },
      },
    });

    if (onPeerConnect) {
      hls.p2pEngine.addEventListener("onPeerConnect", onPeerConnect);
    }
    if (onPeerDisconnect) {
      hls.p2pEngine.addEventListener("onPeerClose", onPeerDisconnect);
    }
    if (onChunkDownloaded) {
      hls.p2pEngine.addEventListener("onChunkDownloaded", onChunkDownloaded);
    }
    if (onChunkUploaded) {
      hls.p2pEngine.addEventListener("onChunkUploaded", onChunkUploaded);
    }

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
