import "./vidstack_indexed_db.css";
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
import { subscribeToUiEvents } from "../utils";
import { useCallback } from "react";
import Hls from "hls.js";
import { IndexedDbStorage } from "../../../custom-segment-storage-example/indexed-db-storage";

export const HlsjsVidstackIndexedDB = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const onProviderChange = useCallback(
    (provider: MediaProviderAdapter | null) => {
      if (isHLSProvider(provider)) {
        const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);

        provider.library = HlsWithP2P as unknown as typeof Hls;

        const storageFactory = (_isLive: boolean) => new IndexedDbStorage();

        const config: HlsWithP2PConfig<typeof Hls> = {
          p2p: {
            core: {
              announceTrackers,
              customSegmentStorageFactory: storageFactory,
            },
            onHlsJsCreated: (hls) => {
              subscribeToUiEvents({
                engine: hls.p2pEngine,
                onPeerConnect,
                onPeerClose,
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
      onPeerClose,
    ],
  );

  return (
    <div className="video-container">
      <MediaPlayer
        autoPlay
        muted
        onProviderChange={onProviderChange}
        src={streamUrl}
        playsInline
      >
        <MediaProvider />
        <DefaultVideoLayout icons={defaultLayoutIcons} />
      </MediaPlayer>

      <div className="notice">
        <p>
          <strong>Note:</strong> Clearing of stored video segments is not
          implemented in this example. To remove cached segments, please clear
          your browser's IndexedDB manually.
        </p>
      </div>
    </div>
  );
};
