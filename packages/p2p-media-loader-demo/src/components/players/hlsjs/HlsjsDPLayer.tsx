import { useEffect, useRef } from "react";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import Hls from "hls.js";
import DPlayer from "dplayer";

const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);

type HlsjsPlayerProps = {
  streamUrl: string;
  announceTrackers: string[];
  onPeerConnect?: (peerId: string) => void;
  onPeerDisconnect?: (peerId: string) => void;
  onChunkDownloaded?: (bytesLength: number, downloadSource: string) => void;
  onChunkUploaded?: (bytesLength: number) => void;
};

export const HlsjsDPlayer = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: HlsjsPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const hls = new HlsWithP2P({
      p2p: {
        core: {
          announceTrackers,
        },
      },
    });

    const player = new DPlayer({
      container: containerRef.current,
      video: {
        url: "",
        type: "customHls",
        customType: {
          customHls: (video: HTMLVideoElement) => {
            if (onPeerConnect) {
              hls.p2pEngine.addEventListener("onPeerConnect", onPeerConnect);
            }
            if (onPeerDisconnect) {
              hls.p2pEngine.addEventListener("onPeerClose", onPeerDisconnect);
            }
            if (onChunkDownloaded) {
              hls.p2pEngine.addEventListener(
                "onChunkDownloaded",
                onChunkDownloaded,
              );
            }
            if (onChunkUploaded) {
              hls.p2pEngine.addEventListener(
                "onChunkUploaded",
                onChunkUploaded,
              );
            }

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
