import { Player, Hls as VimeHls, DefaultUi, Video } from "@vime/react";
import { HlsJsP2PEngine, HlsWithP2PType } from "p2p-media-loader-hlsjs";
import { useRef, useEffect, useState } from "react";
import { PlayerProps } from "../../../types";
import Hls from "hls.js";
import { configureHlsP2PEngineEvents } from "../utils";

export const HlsjsVime = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const [isHlsSupported, setIsHlsSupported] = useState(true);

  const vimeRef = useRef<HTMLVmHlsElement>(null);

  useEffect(() => {
    if (!Hls.isSupported()) {
      setIsHlsSupported(false);
      return;
    }

    if (!vimeRef.current) return;

    window.Hls = HlsJsP2PEngine.injectMixin(Hls);

    const vimeHlsElement = vimeRef.current;

    vimeHlsElement.config = {
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
    };

    return () => {
      window.Hls = undefined;
    };
  }, [
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerDisconnect,
  ]);

  return isHlsSupported ? (
    <div>
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/@vime/core@^5/themes/default.css"
      />
      <Player playsinline>
        <VimeHls ref={vimeRef}>
          <source data-src={streamUrl} type="application/x-mpegURL" />
        </VimeHls>
        <DefaultUi />
      </Player>
    </div>
  ) : (
    <div className="error-message">
      <h3>HLS is not supported in this browser</h3>
    </div>
  );
};
