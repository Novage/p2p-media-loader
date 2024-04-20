import { useEffect, useRef } from "react";
import { PlayerProps } from "../../../types";
import DPlayer from "dplayer";
import { getConfiguredHlsInstance } from "../utils";

export const HlsjsDPlayer = ({
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

    const hls = getConfiguredHlsInstance({
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
        type: "customHls",
        customType: {
          customHls: (video: HTMLVideoElement) => {
            hls.attachMedia(video);
            hls.loadSource(streamUrl);
          },
        },
      },
    });

    player.play();

    return () => {
      player.destroy();
      hls.destroy();
    };
  }, [
    streamUrl,
    announceTrackers,
    onPeerConnect,
    onPeerDisconnect,
    onChunkDownloaded,
    onChunkUploaded,
  ]);

  return (
    <div ref={containerRef} className="video-container">
      <video ref={videoRef} autoPlay controls />
    </div>
  );
};
