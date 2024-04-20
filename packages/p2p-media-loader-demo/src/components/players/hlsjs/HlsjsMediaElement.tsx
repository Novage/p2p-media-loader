import "mediaelement";
import "mediaelement/build/mediaelementplayer.min.css";
import { useEffect, useRef } from "react";
import { getConfiguredHlsInstance } from "../utils";

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
  /* eslint-disable  */
  // @ts-ignore
  const playerRef = useRef<MediaElementPlayer>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const hls = getConfiguredHlsInstance({
      announceTrackers,
      onPeerConnect,
      onPeerDisconnect,
      onChunkDownloaded,
      onChunkUploaded,
    });

    if (!playerRef.current) {
      // @ts-ignore
      playerRef.current = new MediaElementPlayer("player", {
        stretching: "responsive",
        renderers: ["native_hls"],
        hls: {
          ...hls.p2pEngine.getHlsJsConfig(),
        },
        // @ts-ignore
        success: (mediaElement, originalNode, instance) => {
          mediaElement.addEventListener("hlsFragChanged", (event: unknown) => {
            const hlsInstance = mediaElement.hlsPlayer;
            hlsInstance.p2pEngine.setHls(
              hlsInstance.p2pEngine.hlsInstanceGetter,
            );
          });
        },
      });
    }
    /* eslint-enable  */
    hls.attachMedia(videoRef.current);
    hls.loadSource(streamUrl);

    return () => {
      hls.destroy();
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
