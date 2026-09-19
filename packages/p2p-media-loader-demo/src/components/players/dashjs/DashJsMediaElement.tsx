import "mediaelement";
import "mediaelement/build/mediaelementplayer.min.css";
import { useEffect, useRef } from "react";
import { DashJsP2PEngine } from "p2p-media-loader-dashjs";
import { PlayerProps } from "../../../types";
import { createVideoElements, subscribeToUiEvents } from "../utils";
import { installP2PDashJsGlobal } from "./dashjs-global";

export const DashJsMediaElement = ({
  streamUrl,
  coreOptions,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  /* eslint-disable  */
  // @ts-ignore
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
    // MediaElement's dash renderer builds its dash.js player from the global
    // and skips its CDN download when one is present.
    const restoreGlobal = installP2PDashJsGlobal(engine);

    const { videoContainer, videoElement } = createVideoElements();
    containerRef.current.appendChild(videoContainer);

    // @ts-ignore
    const player = new MediaElementPlayer(videoElement.id, {
      iconSprite: "/mejs-controls.svg",
      videoHeight: "100%",
    });

    player.setSrc(streamUrl);
    player.load();

    return () => {
      player?.remove();
      engine.destroy();
      videoContainer.remove();
      restoreGlobal();
    };
    /* eslint-enable  */
  }, [
    coreOptions,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerClose,
    streamUrl,
  ]);

  return <div ref={containerRef} />;
};
