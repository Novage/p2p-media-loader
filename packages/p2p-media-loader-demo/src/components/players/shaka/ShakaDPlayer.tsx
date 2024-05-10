import { ShakaP2PEngine } from "p2p-media-loader-shaka";
import { PlayerProps } from "../../../types";
import { useEffect, useRef, useState } from "react";
import DPlayer from "dplayer";
import { subscribeToUiEvents } from "../utils";
import shaka from "./shaka-import";

export const ShakaDPlayer = ({
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
    if (!shaka.Player.isBrowserSupported()) {
      setIsShakaSupported(false);
      return;
    }

    const shakaP2PEngine = new ShakaP2PEngine(
      {
        core: {
          announceTrackers,
        },
      },
      shaka,
    );

    const player = new DPlayer({
      container: containerRef.current,
      video: {
        url: "",
        type: "customHlsOrDash",
        customType: {
          customHlsOrDash: (video: HTMLVideoElement) => {
            const shakaPlayer = new shaka.Player();
            void shakaPlayer.attach(video);

            subscribeToUiEvents({
              engine: shakaP2PEngine,
              onPeerConnect,
              onPeerDisconnect,
              onChunkDownloaded,
              onChunkUploaded,
            });

            shakaP2PEngine.configureAndInitShakaPlayer(shakaPlayer);
            void shakaPlayer.load(streamUrl);
          },
        },
      },
    });

    return () => {
      shakaP2PEngine.destroy();
      player.destroy();
    };
  }, [
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerDisconnect,
    streamUrl,
  ]);

  return isShakaSupported ? (
    <div ref={containerRef} className="video-container">
      <video playsInline />
    </div>
  ) : (
    <div className="error-message">
      <h3>Shaka Player is not supported in this browser</h3>
    </div>
  );
};
