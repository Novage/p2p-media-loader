import { useEffect, useRef } from "react";
import DPlayer from "dplayer";
import { MediaPlayer, type MediaPlayerClass } from "dashjs";
import { DashJsP2PEngine } from "p2p-media-loader-dashjs";
import { PlayerProps } from "../../../types";
import { subscribeToUiEvents } from "../utils";

export const DashJsDPlayer = ({
  streamUrl,
  coreOptions,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const engine = new DashJsP2PEngine({ core: coreOptions });
    subscribeToUiEvents({
      engine,
      onPeerConnect,
      onPeerClose,
      onChunkDownloaded,
      onChunkUploaded,
    });

    let dashPlayer: MediaPlayerClass | undefined;
    const player = new DPlayer({
      container: containerRef.current,
      autoplay: true,
      volume: 0,
      video: {
        url: "",
        type: "customDash",
        customType: {
          customDash: (video: HTMLVideoElement) => {
            dashPlayer = MediaPlayer().create();
            engine.bindPlayer(dashPlayer);
            dashPlayer.initialize(video, streamUrl, true);
          },
        },
      },
    });

    return () => {
      engine.destroy();
      dashPlayer?.reset();
      dashPlayer?.destroy();
      player.destroy();
    };
  }, [
    streamUrl,
    coreOptions,
    onPeerConnect,
    onPeerClose,
    onChunkDownloaded,
    onChunkUploaded,
  ]);

  return <div ref={containerRef} className="video-container"></div>;
};
