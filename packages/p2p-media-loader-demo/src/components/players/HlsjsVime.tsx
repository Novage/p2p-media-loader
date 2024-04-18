import { Player, Hls as VimeHls, DefaultUi } from "@vime/react";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { useRef, useEffect } from "react";
import Hls from "hls.js";

type HlsjsVimeProps = {
  streamUrl: string;
  announceTrackers: string[];
  onPeerConnect?: (peerId: string) => void;
  onPeerDisconnect?: (peerId: string) => void;
  onChunkDownloaded?: (bytesLength: number, downloadSource: string) => void;
  onChunkUploaded?: (bytesLength: number) => void;
};

interface CustomHlsWithP2P extends Hls {
  p2pEngine: HlsJsP2PEngine;
}

const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
(window as any).Hls = HlsWithP2P;

export const HlsjsVime = ({
  streamUrl,
  announceTrackers,
  onPeerConnect,
  onPeerDisconnect,
  onChunkDownloaded,
  onChunkUploaded,
}: HlsjsVimeProps) => {
  const vimeRef = useRef<HTMLVmHlsElement>(null);

  useEffect(() => {
    if (!vimeRef.current) return;
    const vimeHlsElement = vimeRef.current;

    vimeHlsElement.config = {
      p2p: {
        onHlsJsCreated: (hls: CustomHlsWithP2P) => {
          if (onPeerConnect) {
            hls.p2pEngine.addEventListener("onPeerConnect", onPeerConnect);
          }
          if (onPeerDisconnect) {
            hls.p2pEngine.addEventListener("onPeerClose", onPeerDisconnect);
          }
          if (onChunkDownloaded) {
            hls.p2pEngine.addEventListener(
              "onChunkDownloaded",
              onChunkDownloaded,
            );
          }
          if (onChunkUploaded) {
            hls.p2pEngine.addEventListener("onChunkUploaded", onChunkUploaded);
          }
        },
        core: {
          announceTrackers,
        },
      },
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
