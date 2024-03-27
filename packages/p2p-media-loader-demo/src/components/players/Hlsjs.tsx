import { useEffect, useRef } from "react";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

type HlsjsPlayerProps = {
  streamUrl: string;
  onPeerConnect?: (peerId: string) => void;
  onPeerDisconnect?: (peerId: string) => void;
};
const HlsWithP2P = HlsJsP2PEngine.injectMixin(window.Hls);

export const HlsjsPlayer = ({
  streamUrl,
  onPeerConnect,
  onPeerDisconnect,
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

    hls.attachMedia(videoRef.current);
    hls.loadSource(streamUrl);

    return () => hls.destroy();
  }, [onPeerConnect, onPeerDisconnect, streamUrl]);

  return (
    <div className="video-container">
      <video ref={videoRef} autoPlay controls style={{ width: 800 }} />
    </div>
  );
};
