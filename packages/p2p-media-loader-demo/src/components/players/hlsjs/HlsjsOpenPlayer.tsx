import "openplayerjs/dist/openplayer.min.css";
import OpenPlayerJS from "openplayerjs";
import { useEffect, useRef, useState } from "react";
import { PlayerProps } from "../../../types";
import { HlsJsP2PEngine, HlsWithP2PInstance } from "p2p-media-loader-hlsjs";
import Hls from "hls.js";
import { configureHlsP2PEngineEvents } from "../utils";

export const HlsjsOpenPlayer = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const [isHlsSupported, setIsHlsSupported] = useState(true);

  const playerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!Hls.isSupported()) {
      setIsHlsSupported(false);
      return;
    }

    if (!playerContainerRef.current) return;

    let isCleanedUp = false;
    let player: OpenPlayerJS | undefined;

    window.Hls = HlsJsP2PEngine.injectMixin(Hls);

    const videoContainer = document.createElement("div");
    videoContainer.className = "video-container";
    playerContainerRef.current.appendChild(videoContainer);

    const videoElement = document.createElement("video");
    videoElement.className = "op-player__media";
    videoElement.id = "player";
    videoElement.playsInline = true;
    videoContainer.appendChild(videoElement);

    const cleanup = () => {
      isCleanedUp = true;
      player?.destroy();
      player = undefined;
      videoElement.remove();
      videoContainer.remove();
      window.Hls = undefined;
    };

    const initPlayer = async () => {
      let playerInit;

      try {
        playerInit = new OpenPlayerJS(videoElement, {
          hls: {
            p2p: {
              onHlsJsCreated: (hls: HlsWithP2PInstance<Hls>) => {
                configureHlsP2PEngineEvents({
                  engine: hls.p2pEngine,
                  onPeerConnect,
                  onPeerDisconnect,
                  onChunkDownloaded,
                  onChunkUploaded,
                });
              },
              core: {
                swarmId: "custom swarm ID for stream 2000341",
                trackers: announceTrackers,
              },
            },
          },
          controls: {
            layers: {
              left: ["play", "time", "volume"],
              right: ["settings", "fullscreen", "levels"],
              middle: ["progress"],
            },
          },
        });

        playerInit.src = [
          {
            src: streamUrl,
            type: "application/x-mpegURL",
          },
        ];

        await playerInit.init();
        player = playerInit;

        if (isCleanedUp) cleanup();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to initialize OpenPlayerJS", error);
        player = playerInit;
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

  return isHlsSupported ? (
    <div ref={playerContainerRef} className="player-container" />
  ) : (
    <div className="error-message">
      <h3>HLS is not supported in this browser</h3>
    </div>
  );
};
