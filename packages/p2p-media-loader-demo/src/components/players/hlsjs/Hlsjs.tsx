import { useEffect, useRef } from "react";
import { PlayerProps } from "../../../types";
import { getConfiguredHlsInstance } from "../utils";

export const HlsjsPlayer = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const hls = getConfiguredHlsInstance({
      announceTrackers,
      onPeerConnect,
      onPeerDisconnect,
      onChunkDownloaded,
      onChunkUploaded,
    });

    hls.attachMedia(videoRef.current);
    hls.loadSource(streamUrl);

    return () => hls.destroy();
  }, [
    onPeerConnect,
    onPeerDisconnect,
    onChunkDownloaded,
    onChunkUploaded,
    streamUrl,
    announceTrackers,
  ]);

  return (
    <div className="video-container">
      <video ref={videoRef} autoPlay controls />
    </div>
  );
};
