import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import {
  MediaPlayer,
  MediaProvider,
  isHLSProvider,
  type MediaProviderAdapter,
} from "@vidstack/react";
import {
  defaultLayoutIcons,
  DefaultVideoLayout,
} from "@vidstack/react/player/layouts/default";

import { PlayerProps } from "../../../types";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { configureHlsP2PEngineEvents } from "../utils";
import { useCallback, useEffect, useRef } from "react";

export const HlsjsVidstack = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const engineRef = useRef<HlsJsP2PEngine | null>(null);

  useEffect(() => {
    engineRef.current = new HlsJsP2PEngine({
      core: {
        swarmId: "custom swarm ID for stream 2000341",
        announceTrackers,
      },
    });

    configureHlsP2PEngineEvents({
      engine: engineRef.current,
      onPeerConnect,
      onPeerDisconnect,
      onChunkDownloaded,
      onChunkUploaded,
    });

    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, [
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerDisconnect,
  ]);

  const onProviderChange = useCallback(
    (provider: MediaProviderAdapter | null) => {
      if (isHLSProvider(provider) && engineRef.current) {
        provider.library =
          "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.7/hls.min.js";

        provider.config = {
          ...engineRef.current.getHlsJsConfig(),
        };

        provider.onInstance((hls) => {
          if (!engineRef.current) return;

          engineRef.current.setHls(hls);
        });
      }
    },
    [],
  );

  return (
    <div className="video-container">
      <MediaPlayer
        muted
        onProviderChange={onProviderChange}
        src={streamUrl}
        playsInline
      >
        <MediaProvider />
        <DefaultVideoLayout icons={defaultLayoutIcons} />
      </MediaPlayer>
    </div>
  );
};
