import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { PlayerEvents } from "./../../types";
import { ShakaP2PEngine } from "p2p-media-loader-shaka";
import { DashJsP2PEngine } from "p2p-media-loader-dashjs";
import { VideoJsP2PEngine } from "p2p-media-loader-videojs";

type UIEventsProps = PlayerEvents & {
  engine: HlsJsP2PEngine | ShakaP2PEngine | DashJsP2PEngine | VideoJsP2PEngine;
};

export const subscribeToUiEvents = ({
  engine,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: UIEventsProps) => {
  if (onPeerConnect) engine.addEventListener("onPeerConnect", onPeerConnect);
  if (onPeerClose) {
    engine.addEventListener("onPeerClose", onPeerClose);
  }
  if (onChunkDownloaded) {
    engine.addEventListener("onChunkDownloaded", onChunkDownloaded);
  }
  if (onChunkUploaded) {
    engine.addEventListener("onChunkUploaded", onChunkUploaded);
  }
};

/**
 * While the quality selector is on Auto, its first option names the quality
 * on screen: "Auto (720p)". The height comes from the video element, so the
 * label changes when the new quality plays, not when the player starts to
 * download it. Returns a function that updates the label, for after the
 * options are rebuilt, and one that removes the listeners.
 */
export const showPlayingQuality = (
  select: HTMLSelectElement,
  video: HTMLVideoElement,
  autoValue: string,
) => {
  const update = () => {
    const auto = select.options.item(0);
    if (!auto) return;
    auto.text =
      select.value === autoValue && video.videoHeight
        ? `Auto (${video.videoHeight}p)`
        : "Auto";
  };
  video.addEventListener("resize", update);
  select.addEventListener("change", update);
  const dispose = () => {
    video.removeEventListener("resize", update);
    select.removeEventListener("change", update);
  };
  return { update, dispose };
};

interface VideoElementsOptions {
  videoId?: string;
  videoClassName?: string;
  containerClassName?: string;
  playIsInline?: boolean;
  autoplay?: boolean;
  muted?: boolean;
  aspectRatio?: string | null;
}

export const createVideoElements = (options: VideoElementsOptions = {}) => {
  const {
    videoId = "player",
    videoClassName = "",
    containerClassName = "video-container",
    playIsInline = true,
    autoplay = true,
    muted = true,
    aspectRatio = null,
  } = options;

  const videoContainer = document.createElement("div");
  videoContainer.className = containerClassName;

  const videoElement = document.createElement("video");
  videoElement.className = videoClassName;
  videoElement.id = videoId;
  videoElement.playsInline = playIsInline;
  videoElement.autoplay = autoplay;
  videoElement.muted = muted;

  if (aspectRatio) {
    videoElement.style.aspectRatio = aspectRatio;
  }

  videoContainer.appendChild(videoElement);

  return { videoContainer, videoElement };
};
