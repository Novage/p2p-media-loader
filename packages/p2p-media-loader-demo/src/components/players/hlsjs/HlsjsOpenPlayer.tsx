import "openplayerjs/dist/openplayer.min.css";
import OpenPlayerJS from "openplayerjs";
import { useEffect, useRef } from "react";
import { PlayerProps } from "../../../types";
import { HlsJsP2PEngine, HlsWithP2PInstance } from "p2p-media-loader-hlsjs";
import Hls from "hls.js";
import { createVideoElements, subscribeToUiEvents } from "../utils";

export const HlsjsOpenPlayer = ({
  streamUrl,
  coreOptions,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const playerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playerContainerRef.current || !Hls.isSupported()) return;

    window.Hls = HlsJsP2PEngine.injectMixin(Hls);

    let isCleanedUp = false;
    let player: OpenPlayerJS | undefined;

    const { videoContainer, videoElement } = createVideoElements({
      videoClassName: "op-player__media",
    });

    playerContainerRef.current.appendChild(videoContainer);

    const cleanup = () => {
      isCleanedUp = true;
      player?.destroy();
      videoElement.remove();
      videoContainer.remove();
      window.Hls = undefined;
    };

    const initPlayer = async () => {
      const playerInit = new OpenPlayerJS(videoElement, {
        hls: {
          p2p: {
            onHlsJsCreated: (hls: HlsWithP2PInstance<Hls>) => {
              subscribeToUiEvents({
                engine: hls.p2pEngine,
                onPeerConnect,
                onPeerClose,
                onChunkDownloaded,
                onChunkUploaded,
              });
            },
            core: coreOptions,
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

      try {
        await playerInit.init();

        player = playerInit;
      } catch (error) {
        player = playerInit;

        cleanup();
        // eslint-disable-next-line no-console
        console.error("Error initializing OpenPlayerJS", error);
      }

      if (isCleanedUp) cleanup();
    };

    void initPlayer();

    return () => cleanup();
  }, [
    coreOptions,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerClose,
    streamUrl,
    
  ]);

  return Hls.isSupported() ? (
    <div ref={playerContainerRef} className="player-container" />
  ) : (
    <div className="error-message">
      <h3>HLS is not supported in this browser</h3>
    </div>
  );
};
