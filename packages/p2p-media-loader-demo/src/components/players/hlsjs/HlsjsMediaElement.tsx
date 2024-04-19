/*import Hls from "hls.js";
import "mediaelement";
import "mediaelement/build/mediaelementplayer.min.css";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { useEffect, useRef } from "react";

const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);

type HlsjsMediaElelementProps = {
  streamUrl: string;
  announceTrackers: string[];
  onPeerConnect?: (peerId: string) => void;
  onPeerDisconnect?: (peerId: string) => void;
  onChunkDownloaded?: (bytesLength: number, downloadSource: string) => void;
  onChunkUploaded?: (bytesLength: number) => void;
};

export const HlsjsMediaElement = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: HlsjsMediaElelementProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<MediaElementPlayer>(null);

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

    if (!playerRef.current) {
      playerRef.current = new MediaElementPlayer("player", {
        stretching: "responsive",
        renderers: ["native_hls"],
        hls: {
          ...hls.p2pEngine.getHlsJsConfig(),
        },
        success: (mediaElement, originalNode, instance) => {
          mediaElement.addEventListener("hlsFragChanged", (event: any) => {
            let hls2 = mediaElement.hlsPlayer;
            hls.p2pEngine.setHls(hls2.p2pEngine.hlsInstanceGetter);
            console.log("hlsFragChanged", hls2.p2pEngine.hlsInstanceGetter);
          });
        },
      });
    }

    playerRef.current.setSrc(streamUrl);
    playerRef.current.load();
    playerRef.current.play();

    return () => {};
  }, [
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerDisconnect,
    streamUrl,
  ]);
  return (
    <div>
      <video ref={videoRef} id="player" controls autoPlay></video>
    </div>
  );
};
*/
