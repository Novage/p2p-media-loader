import "./hlsjs.css";
import "./indexed_db.css";
import { useEffect, useRef } from "react";
import { PlayerProps } from "../../../types";
import { subscribeToUiEvents } from "../utils";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import Hls from "hls.js";
import { IndexedDbStorage } from "../../../custom-segment-storage-example/indexed-db-storage";

/** HLS.js with the example IndexedDB segment storage in place of the memory one. */
export const HlsjsIndexedDB = ({
  streamUrl,
  coreOptions,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current || !Hls.isSupported()) return;

    const HlsWithP2P = HlsJsP2PEngine.injectMixin(Hls);
    const hls = new HlsWithP2P({
      p2p: {
        core: {
          ...coreOptions,
          customSegmentStorageFactory: (_isLive: boolean) =>
            new IndexedDbStorage(),
        },
        onHlsJsCreated(hls) {
          subscribeToUiEvents({
            engine: hls.p2pEngine,
            onPeerConnect,
            onPeerClose,
            onChunkDownloaded,
            onChunkUploaded,
          });
        },
      },
    });

    hls.attachMedia(videoRef.current);
    hls.loadSource(streamUrl);

    return () => {
      hls.destroy();
    };
  }, [
    onPeerConnect,
    onPeerClose,
    onChunkDownloaded,
    onChunkUploaded,
    streamUrl,
    coreOptions,
  ]);

  return Hls.isSupported() ? (
    <div className="video-container">
      <video
        ref={videoRef}
        style={{ aspectRatio: "auto" }}
        controls
        playsInline
        autoPlay
        muted
      />
      <div className="notice">
        <p>
          <strong>Note:</strong> Clearing of stored video segments is not
          implemented in this example. To remove cached segments, please clear
          your browser&apos;s IndexedDB manually.{" "}
          <a
            href="https://github.com/Novage/p2p-media-loader/tree/main/packages/p2p-media-loader-demo/src/custom-segment-storage-example"
            target="_blank"
            rel="noreferrer"
            className="source-code-link"
          >
            View Source Code
          </a>
        </p>
      </div>
    </div>
  ) : (
    <div className="error-message">
      <h3>HLS is not supported in this browser</h3>
    </div>
  );
};
