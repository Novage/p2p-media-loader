import { Player, Hls as VimeHls, DefaultUi } from "@vime/react";
import { HlsJsP2PEngine, HlsWithP2PType } from "p2p-media-loader-hlsjs";
import { useRef, useEffect } from "react";
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
  const vimeRef = useRef<HTMLVmHlsElement>(null);

  useEffect(() => {
    if (!vimeRef.current) return;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
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
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      window.Hls = undefined;
    };
  }, [
    announceTrackers,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerDisconnect,
  ]);

  return (
    <div>
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/@vime/core@^5/themes/default.css"
      />
      <Player autoplay={true}>
        <VimeHls ref={vimeRef}>
          <source data-src={streamUrl} type="application/x-mpegURL" />
        </VimeHls>
        <DefaultUi />
      </Player>
    </div>
  );
};
