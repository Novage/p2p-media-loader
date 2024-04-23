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
  const videoRef = useRef<HTMLVideoElement>(null);
  /* eslint-disable  */
  // @ts-ignore
  const playerRef = useRef<MediaElementPlayer>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    window.Hls = HlsJsP2PEngine.injectMixin(Hls);

    if (!playerRef.current) {
      // @ts-ignore
      playerRef.current = new MediaElementPlayer("player", {
        stretching: "responsive",
        iconSprite: "/mejs-controls.svg",
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
    }

    playerRef.current.setSrc(streamUrl);
    playerRef.current.load();
    /* eslint-enable  */

    return () => {
      delete window.Hls;
    };
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
      <video ref={videoRef} id="player" controls autoPlay />
    </div>
  );
};
