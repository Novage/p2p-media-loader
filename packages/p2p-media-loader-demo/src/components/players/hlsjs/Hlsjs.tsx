import { useEffect, useRef, useState } from "react";
import { PlayerProps } from "../../../types";
import { configureHlsP2PEngineEvents } from "../utils";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import Hls from "hls.js";

export const HlsjsPlayer = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const [isHlsSupported, setIsHlsSupported] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!Hls.isSupported()) {
      setIsHlsSupported(false);
      return;
    }

    if (!videoRef.current) return;

    const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);
    const hls = new HlsWithP2P({
      p2p: {
        core: {
          swarmId: "custom swarm ID for stream 2000341",
          announceTrackers,
        },
      },
    });

    configureHlsP2PEngineEvents({
      engine: hls.p2pEngine,
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

  return isHlsSupported ? (
    <div className="video-container">
      <video ref={videoRef} autoPlay controls />
    </div>
  ) : (
    <div className="error-message">
      <h3>HLS is not supported in this browser</h3>
    </div>
  );
};
