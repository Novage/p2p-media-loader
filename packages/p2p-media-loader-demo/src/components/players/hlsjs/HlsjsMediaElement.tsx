import "mediaelement";
import "mediaelement/build/mediaelementplayer.min.css";
import { useEffect, useRef } from "react";
import Hls from "hls.js";
import { HlsJsP2PEngine, HlsWithP2PType } from "p2p-media-loader-hlsjs";
import { configureHlsP2PEngineEvents } from "../utils";

type HlsjsMediaElementProps = {
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
}: HlsjsMediaElementProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  /* eslint-disable  */
  // @ts-ignore
  useEffect(() => {
    if (!containerRef.current) return;

    const videoContainer = document.createElement("div");
    videoContainer.className = "video-container";
    containerRef.current.appendChild(videoContainer);

    const videoElement = document.createElement("video");
    videoElement.id = "player";
    videoContainer.appendChild(videoElement);

    window.Hls = HlsJsP2PEngine.injectMixin(Hls);

    // @ts-ignore
    const player = new MediaElementPlayer(videoElement.id, {
      iconSprite: "/mejs-controls.svg",
      videoHeight: "100%",
      hls: {
        p2p: {
          onHlsJsCreated: (hls: HlsWithP2PType<Hls>) => {
            configureHlsP2PEngineEvents({
              engine: hls.p2pEngine,
              onPeerConnect,
              onPeerDisconnect,
              onChunkDownloaded,
              onChunkUploaded,
            });
          },
          core: {
            swarmId: "custom swarm ID for stream 2000341",
            announceTrackers,
          },
        },
      },
    });

    player.setSrc(streamUrl);
    player.load();

    return () => {
      window.Hls = undefined;
      player?.remove();
      videoContainer.remove();
    };
    /* eslint-enable  */
  }, [
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerDisconnect,
    streamUrl,
  ]);

  return <div ref={containerRef} />;
};
