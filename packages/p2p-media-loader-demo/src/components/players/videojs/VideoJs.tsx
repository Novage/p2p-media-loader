import "video.js/dist/video-js.css";
import "../hlsjs/hlsjs.css";
import { useEffect, useRef } from "react";
import videojs from "video.js";
import { VideoJsP2PEngine } from "p2p-media-loader-videojs";
import { PlayerProps } from "../../../types";
import { subscribeToUiEvents } from "../utils";

const AUTO_QUALITY = "auto";

export type VhsRepresentation = {
  id: string;
  height?: number;
  bandwidth?: number;
  enabled(enable?: boolean): unknown;
};
type TechWithVhs = { vhs?: { representations?(): VhsRepresentation[] } };

export const VideoJs = ({
  streamUrl,
  coreOptions,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const qualityRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!containerRef.current || !qualityRef.current) return;

    // Video.js replaces the element it is given, so it gets one of its own.
    const videoElement = document.createElement("video");
    videoElement.className = "video-js vjs-default-skin";
    videoElement.style.width = "100%";
    videoElement.style.aspectRatio = "16 / 9";
    containerRef.current.appendChild(videoElement);

    const player = videojs(videoElement, {
      controls: true,
      autoplay: true,
      muted: true,
      playsinline: true,
      html5: {
        vhs: {
          // VHS stands aside for native HLS on Safari and iOS unless told
          // otherwise; there is nothing to route through the core natively.
          overrideNative: true,
          // VHS alone caps the rendition by the size the player is rendered
          // at, so in a small window it picks a lower one than HLS.js,
          // dash.js and Shaka do and shares with none of them: a rendition is
          // a swarm. Every engine in this demo chooses on bandwidth alone.
          limitRenditionByPlayerDimensions: false,
        },
        nativeAudioTracks: false,
        nativeVideoTracks: false,
      },
    });

    const engine = new VideoJsP2PEngine({ core: coreOptions }, videojs);
    subscribeToUiEvents({
      engine,
      onPeerConnect,
      onPeerClose,
      onChunkDownloaded,
      onChunkUploaded,
    });
    engine.bindPlayer(player);

    const qualityElement = qualityRef.current;
    const representations = () =>
      (player.tech(true) as unknown as TechWithVhs).vhs?.representations?.() ??
      [];
    // A rendition is named by what it is rather than by its VHS id, which
    // carries the playlist URL: a live stream whose CDN signs those per
    // response renames every rendition each time the manifest is refreshed.
    const labelOf = (r: VhsRepresentation) =>
      `${r.height ?? "?"}p (${Math.round((r.bandwidth ?? 0) / 1000)}k)`;
    // Two renditions can render the same name — an audio-only master with a
    // language per rendition at one bitrate, or two variants at one height
    // whose bandwidths round together. A name that fits both pins neither,
    // since every rendition it fits is enabled and ABR keeps its choice, so
    // repeats are numbered. VHS lists them in manifest order, which holds
    // across refreshes.
    const namesOf = (reps: VhsRepresentation[]) => {
      const seen = new Map<string, number>();
      return reps.map((r) => {
        const name = labelOf(r);
        const count = (seen.get(name) ?? 0) + 1;
        seen.set(name, count);
        return count === 1 ? name : `${name} #${count}`;
      });
    };
    let chosen: string = AUTO_QUALITY;
    // Enabling a single representation pins it; enabling all restores ABR.
    const applyChoice = () => {
      const reps = representations();
      const names = namesOf(reps);
      reps.forEach((r, i) =>
        r.enabled(chosen === AUTO_QUALITY || names[i] === chosen),
      );
    };

    // VHS fills its rendition list as it parses the manifest, and builds it
    // again on a refresh, so the list is rebuilt whenever it has changed —
    // and the viewer's choice is carried over and applied to the new one.
    let listed = "";
    const updateQualityOptions = () => {
      const reps = representations();
      // Keyed on the names, not the VHS ids: an id carries the playlist URL,
      // which a signing CDN changes on every refresh, and a rendition
      // re-advertised at another bitrate keeps its id while its name moves.
      // The names are what the selector offers and what the pinned choice is
      // matched against, so they are what has to stay in step with it.
      const names = namesOf(reps);
      const shown = names.join();
      if (shown === listed) return;
      listed = shown;
      // A live master may stop advertising the pinned rendition, or advertise
      // it at another bitrate under a new label. Keeping the old choice would
      // enable no rendition at all, and VHS would have nothing to select —
      // which is as true of a master that comes back down to a single one as
      // of one that keeps several, so this runs before the selector is hidden
      // rather than after.
      if (!names.includes(chosen)) chosen = AUTO_QUALITY;
      if (reps.length < 2) {
        qualityElement.style.display = "none";
        applyChoice();
        return;
      }
      qualityElement.style.display = "block";
      qualityElement.options.length = 0;
      qualityElement.add(new Option("Auto", AUTO_QUALITY));
      for (const name of names) {
        qualityElement.add(new Option(name));
      }
      qualityElement.value = chosen;
      applyChoice();
    };
    const onQualityChange = () => {
      chosen = qualityElement.value;
      applyChoice();
    };
    qualityElement.addEventListener("change", onQualityChange);
    const QUALITY_EVENTS = [
      "loadedmetadata",
      "loadeddata",
      "canplay",
      "progress",
    ];
    for (const event of QUALITY_EVENTS) player.on(event, updateQualityOptions);

    const isDash = /\.mpd(\?|#|$)/i.test(streamUrl);
    player.src({
      src: streamUrl,
      type: isDash ? "application/dash+xml" : "application/x-mpegURL",
    });

    return () => {
      for (const event of QUALITY_EVENTS) {
        player.off(event, updateQualityOptions);
      }
      qualityElement.removeEventListener("change", onQualityChange);
      engine.destroy();
      player.dispose();
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
      <div ref={containerRef} />
      <div className="select-container">
        <select ref={qualityRef} className="quality-selector" />
      </div>
    </div>
  );
};
