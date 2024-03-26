import { useEffect, useRef } from "react";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";

type HlsjsPlayerProps = {
  streamUrl: string;
};
const HlsWithP2P = HlsJsP2PEngine.injectMixin(window.Hls);

export const HlsjsPlayer = ({ streamUrl }: HlsjsPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    const hls = new HlsWithP2P();

    hls.attachMedia(videoRef.current);
    hls.loadSource(streamUrl);

    return () => hls.destroy();
  }, [streamUrl]);

  return (
    <div className="video-container">
      <video ref={videoRef} autoPlay controls style={{ width: 800 }} />
    </div>
  );
};
