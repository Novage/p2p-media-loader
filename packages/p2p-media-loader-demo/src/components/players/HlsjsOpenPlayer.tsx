import "./openPlayer.css";
import { useEffect, useRef } from "react";
import OpenPlayerJS from "openplayerjs";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import Hls from "hls.js";

type HlsjsOpenPlayer = {
  streamUrl: string;
  announceTrackers: string[];
  onPeerConnect?: (peerId: string) => void;
  onPeerDisconnect?: (peerId: string) => void;
  onChunkDownloaded?: (bytesLength: number, downloadSource: string) => void;
  onChunkUploaded?: (bytesLength: number) => void;
};
const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);

export const HlsjsOpenPlayer = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: HlsjsOpenPlayer) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<OpenPlayerJS | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const initPlayer = async () => {
      if (!videoRef.current || playerRef.current) return;

      playerRef.current = new OpenPlayerJS(videoRef.current, {
        controls: {
          layers: {
            left: ["play", "time", "volume"],
            right: ["settings", "fullscreen", "levels"],
            middle: ["progress"],
          },
        },
      });

      await playerRef.current.init();
    };

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

    void initPlayer();

    return () => hls.destroy();
  }, [
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerDisconnect,
    streamUrl,
  ]);

  return (
    <video className="op-player__media" id="player" ref={videoRef}></video>
  );
};
