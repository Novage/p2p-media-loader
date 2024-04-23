import { useEffect, useRef } from "react";
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
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);

    const hls = new HlsWithP2P({
      p2p: {
        core: {
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

  return (
    <div className="video-container">
      <video ref={videoRef} autoPlay controls />
    </div>
  );
};
