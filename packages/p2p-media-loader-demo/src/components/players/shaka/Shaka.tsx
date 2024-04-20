import { useEffect, useRef } from "react";
import { ShakaP2PEngine } from "p2p-media-loader-shaka";
import { PlayerProps } from "../../../types";

import "shaka-player/dist/shaka-player.ui";
import "shaka-player/dist/controls.css";
import { getConfiguredShakaP2PEngine } from "../utils";

ShakaP2PEngine.registerPlugins();

export const Shaka = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!videoRef.current || !videoContainerRef.current) return;

    const shakaP2PEngine = getConfiguredShakaP2PEngine({
      announceTrackers,
      onPeerConnect,
      onPeerDisconnect,
      onChunkDownloaded,
      onChunkUploaded,
    });

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
