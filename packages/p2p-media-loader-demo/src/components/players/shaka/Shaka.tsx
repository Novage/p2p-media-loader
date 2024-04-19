import { useEffect, useRef } from "react";
import { ShakaP2PEngine } from "p2p-media-loader-shaka";

import "shaka-player/dist/shaka-player.ui";
import "shaka-player/dist/controls.css";

type ShakaProps = {
  streamUrl: string;
  announceTrackers: string[];
  onPeerConnect?: (peerId: string) => void;
  onPeerDisconnect?: (peerId: string) => void;
  onChunkDownloaded?: (bytesLength: number, downloadSource: string) => void;
  onChunkUploaded?: (bytesLength: number) => void;
};

ShakaP2PEngine.registerPlugins();
export const Shaka = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: ShakaProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!videoRef.current || !videoContainerRef.current) return;

    const shakaP2PEngine = new ShakaP2PEngine({
      core: {
        announceTrackers,
      },
    });
    if (onPeerConnect) {
      shakaP2PEngine.addEventListener("onPeerConnect", onPeerConnect);
    }
    if (onPeerDisconnect) {
      shakaP2PEngine.addEventListener("onPeerClose", onPeerDisconnect);
    }
    if (onChunkDownloaded) {
      shakaP2PEngine.addEventListener("onChunkDownloaded", onChunkDownloaded);
    }
    if (onChunkUploaded) {
      shakaP2PEngine.addEventListener("onChunkUploaded", onChunkUploaded);
    }

    const player = new shaka.Player();
    const ui = new shaka.ui.Overlay(
      player,
      videoContainerRef.current,
      videoRef.current,
    );

    void player.attach(videoRef.current);
    shakaP2PEngine.configureAndInitShakaPlayer(player);
    void player.load(streamUrl);

    return () => {
      void player.destroy();
      void ui.destroy();
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
    <div ref={videoContainerRef} className="video-container">
      <video ref={videoRef} autoPlay className="video-player" />
    </div>
  );
};
