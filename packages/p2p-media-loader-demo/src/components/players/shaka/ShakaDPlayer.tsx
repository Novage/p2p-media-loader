import { ShakaP2PEngine } from "p2p-media-loader-shaka";
import { PlayerProps } from "../../../types";
import { useEffect, useRef } from "react";
import DPlayer from "dplayer";
import { getConfiguredShakaP2PEngine } from "../utils";

ShakaP2PEngine.registerPlugins();

export const ShakaDPlayer = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const shakaP2PEngine = getConfiguredShakaP2PEngine({
      announceTrackers,
      onPeerConnect,
      onPeerDisconnect,
      onChunkDownloaded,
      onChunkUploaded,
    });

    const player = new DPlayer({
      container: containerRef.current,
      video: {
        url: "",
        type: "customHlsOrDash",
        customType: {
          customHlsOrDash: (video: HTMLVideoElement) => {
            const shakaPlayer = new shaka.Player();
            void shakaPlayer.attach(video);

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

  return (
    <div ref={containerRef} className="video-container">
      <video ref={videoRef} autoPlay controls />
    </div>
  );
};
