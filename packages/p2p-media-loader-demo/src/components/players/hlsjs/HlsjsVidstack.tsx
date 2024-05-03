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
import { HlsJsP2PEngine, HlsWithP2PConfig } from "p2p-media-loader-hlsjs";
import { configureHlsP2PEngineEvents } from "../utils";
import { useCallback } from "react";
import Hls from "hls.js";

export const HlsjsVidstack = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const onProviderChange = useCallback(
    (provider: MediaProviderAdapter | null) => {
      if (isHLSProvider(provider)) {
        const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);

        provider.library = HlsWithP2P as unknown as typeof Hls;

        const config: HlsWithP2PConfig<typeof Hls> = {
          p2p: {
            core: {
              swarmId: "custom swarm ID for stream 2000341",
              announceTrackers,
            },
            onHlsJsCreated: (hls) => {
              configureHlsP2PEngineEvents({
                engine: hls.p2pEngine,
                onPeerConnect,
                onPeerDisconnect,
                onChunkDownloaded,
                onChunkUploaded,
              });
            },
          },
        };

        provider.config = config;
      }
    },
    [
      announceTrackers,
      onChunkDownloaded,
      onChunkUploaded,
      onPeerConnect,
      onPeerDisconnect,
    ],
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
