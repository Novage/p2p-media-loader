import "../hlsjs/hlsjs.css";
import { useEffect, useRef } from "react";
import { MediaPlayer, type MediaPlayerClass } from "dashjs";
import { DashJsP2PEngine } from "p2p-media-loader-dashjs";
import { PlayerProps } from "../../../types";
import { subscribeToUiEvents } from "../utils";

const AUTO_QUALITY = "auto";

export const DashJs = ({
  streamUrl,
  coreOptions,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const qualityRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!videoRef.current || !qualityRef.current) return;

    const player: MediaPlayerClass = MediaPlayer().create();
    const engine = new DashJsP2PEngine({ core: coreOptions });

    subscribeToUiEvents({
      engine,
      onPeerConnect,
      onPeerClose,
      onChunkDownloaded,
      onChunkUploaded,
    });

    const qualityElement = qualityRef.current;
    const updateQualityOptions = () => {
      const representations = player.getRepresentationsByType("video");
      if (representations.length < 2) {
        qualityElement.style.display = "none";
        return;
      }
      qualityElement.style.display = "block";
      qualityElement.options.length = 0;
      qualityElement.add(new Option("Auto", AUTO_QUALITY));
      for (const r of representations) {
        const label = `${r.height}p (${Math.round(r.bandwidth / 1000)}k)`;
        qualityElement.add(new Option(label, r.id));
      }
    };
    const onQualityChange = () => {
      const auto = qualityElement.value === AUTO_QUALITY;
      player.updateSettings({
        streaming: { abr: { autoSwitchBitrate: { video: auto } } },
      });
      if (auto) return;
      // Keep the buffer: replacing it lands the player on the live edge with
      // nothing ahead for peers to fill; the new quality starts at the next
      // segment instead.
      player.setRepresentationForTypeById("video", qualityElement.value, false);
    };

    qualityElement.addEventListener("change", onQualityChange);
    player.on("streamInitialized", updateQualityOptions);

    // The engine hooks the player's loader through `extend`, which dash.js
    // resolves on first use, so it must be bound before initialize().
    engine.bindPlayer(player);
    player.initialize(videoRef.current, streamUrl, true);

    return () => {
      qualityElement.removeEventListener("change", onQualityChange);
      player.off("streamInitialized", updateQualityOptions);
      engine.destroy();
      player.reset();
      player.destroy();
    };
  }, [
    coreOptions,
    onChunkDownloaded,
    onChunkUploaded,
    onPeerConnect,
    onPeerClose,
    streamUrl,
  ]);

  return (
    <div className="video-container">
      <video
        ref={videoRef}
        style={{ aspectRatio: "auto" }}
        controls
        playsInline
        autoPlay
        muted
      />
      <div className="select-container">
        <select ref={qualityRef} className="quality-selector" />
      </div>
    </div>
  );
};
