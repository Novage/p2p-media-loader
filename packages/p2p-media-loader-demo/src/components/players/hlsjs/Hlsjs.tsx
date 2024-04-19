import { useEffect, useRef } from "react";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { PlayerProps } from "../../../types";
import Hls from "hls.js";

const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);

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
