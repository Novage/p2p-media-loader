import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import {
  MediaPlayer as VidstackPlayer,
  type MediaPlayerInstance,
  MediaProvider,
  isDASHProvider,
  type MediaProviderAdapter,
} from "@vidstack/react";
import {
  defaultLayoutIcons,
  DefaultVideoLayout,
} from "@vidstack/react/player/layouts/default";
import { MediaPlayer, type MediaPlayerClass } from "dashjs";
import { DashJsP2PEngine } from "p2p-media-loader-dashjs";
import { useCallback, useEffect, useRef } from "react";
import { PlayerProps } from "../../../types";
import { subscribeToUiEvents } from "../utils";

export const DashJsVidstack = ({
  streamUrl,
  coreOptions,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const engineRef = useRef<DashJsP2PEngine>(null);

  const onProviderChange = useCallback(
    (provider: MediaProviderAdapter | null) => {
      if (!isDASHProvider(provider)) return;

      // Vidstack would otherwise load dash.js from a CDN; use the bundled one.
      provider.library = MediaPlayer;

      engineRef.current?.destroy();
      const engine = new DashJsP2PEngine({ core: coreOptions });
      engineRef.current = engine;
      subscribeToUiEvents({
        engine,
        onPeerConnect,
        onPeerClose,
        onChunkDownloaded,
        onChunkUploaded,
      });

      // Invoked with each new dash.js instance right before Vidstack attaches
      // it to the media — the point at which the engine must replace its loader.
      provider.onInstance((instance: MediaPlayerClass) => {
        engine.bindPlayer(instance);
      });
    },
    [
      coreOptions,
      onChunkDownloaded,
      onChunkUploaded,
      onPeerConnect,
      onPeerClose,
    ],
  );

  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  const playerRef = useRef<MediaPlayerInstance>(null);
  useEffect(() => {
    // Switch quality at the next segment rather than flushing the buffer,
    // which would leave no window ahead of the playhead for peers to fill.
    if (playerRef.current) playerRef.current.qualities.switch = "next";
  });

  return (
    <div className="video-container">
      <VidstackPlayer
        ref={playerRef}
        autoPlay
        muted
        onProviderChange={onProviderChange}
        src={streamUrl}
        playsInline
      >
        <MediaProvider />
        <DefaultVideoLayout icons={defaultLayoutIcons} />
      </VidstackPlayer>
    </div>
  );
};
