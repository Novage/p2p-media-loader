import { useEffect, useRef } from "react";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import Hls from "hls.js";

type HlsjsPlayerProps = {
  streamUrl: string;
  onPeerConnect?: (peerId: string) => void;
  onPeerDisconnect?: (peerId: string) => void;
  onChunkDownloaded?: (bytesLength: number, downloadSource: string) => void;
  onChunkUploaded?: (bytesLength: number) => void;
  updateTrackers?: (trackers: string[]) => void;
};
const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);

export const HlsjsPlayer = ({
  streamUrl,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
  updateTrackers,
}: HlsjsPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    const hls = new HlsWithP2P();

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

    if (updateTrackers) {
      const trackers = hls.p2pEngine.getConfig().core.announceTrackers;
      updateTrackers([...trackers]);
    }

    return () => hls.destroy();
  }, [
    onPeerConnect,
    onPeerDisconnect,
    onChunkDownloaded,
    onChunkUploaded,
    updateTrackers,
    streamUrl,
  ]);

  return (
    <div className="video-container">
      <video ref={videoRef} autoPlay controls />
    </div>
  );
};
