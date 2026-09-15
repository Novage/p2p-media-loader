import "@videojs/react/video/skin.css";
import "./videojs10.css";
import { useMemo, useState } from "react";
import type { MediaPlayerClass } from "dashjs";
import { useAttachMedia, useDestroy, useMediaInstance } from "@videojs/react";
import { VideoPlayer, VideoSkin } from "@videojs/react/video";
import { DashAdapter, type DashSource } from "@videojs/dash-video";
import { DashJsP2PEngine } from "p2p-media-loader-dashjs";
import { PlayerProps } from "../../../types";
import { subscribeToUiEvents } from "../utils";

/**
 * video.js 10 on the dash.js P2P engine. v10's `DashAdapter` creates and
 * initializes its dash.js player up front and attaches a source only when
 * one is set, so the window the engine needs — `bindPlayer` before dash.js
 * makes its first request — is any moment before the source goes in.
 * Nothing in the packages changes for this.
 *
 * Quality selection is the skin's own, from the representations dash.js
 * reports; the other demo players carry a `<select>` because their skins
 * have none.
 */
export const VideoJs10DashJs = (props: PlayerProps) => {
  // A new adapter, dash.js player and engine per stream and per set of
  // options, the way the other players tear down and rebuild.
  const playerKey = useMemo(
    () => JSON.stringify([props.streamUrl, props.coreOptions]),
    [props.streamUrl, props.coreOptions],
  );
  return (
    <div className="video-container">
      <div className="videojs10-player">
        <VideoPlayer key={playerKey}>
          <VideoSkin>
            <P2PDashVideo {...props} />
          </VideoSkin>
        </VideoPlayer>
      </div>
    </div>
  );
};

// The adapter is driven imperatively, as v10's own media components drive
// it; a plain function keeps that out of the component body.
const setSource = (media: DashAdapter, source: DashSource) => {
  media.source = source;
};

const P2PDashVideo = ({
  streamUrl,
  coreOptions,
  onPeerConnect,
  onPeerClose,
  onChunkDownloaded,
  onChunkUploaded,
}: PlayerProps) => {
  // Created once with the media instance and destroyed with it: `useDestroy`
  // is what v10 uses for its own adapters, and it survives StrictMode's
  // simulated unmount, which a plain effect cleanup would not. That matters
  // here more than anywhere: `bindPlayer` extends the player's loader, and
  // dash.js keeps the first extension it resolved, so a second engine bound
  // to the same player would never see a request.
  const [engine] = useState(() => new DashJsP2PEngine({ core: coreOptions }));
  useDestroy(engine);

  // `setup` runs once per adapter, before it is attached. The dash.js player
  // already exists and has made no request; the source set here is what
  // starts them.
  const media = useMediaInstance(DashAdapter, (media) => {
    subscribeToUiEvents({
      engine,
      onPeerConnect,
      onPeerClose,
      onChunkDownloaded,
      onChunkUploaded,
    });
    // v10 bundles its own dash.js (5.2.0) beside the demo's; the two type
    // declarations differ in a detail and the player is the same class.
    engine.bindPlayer(media.engine as unknown as MediaPlayerClass);
    setSource(media, { src: streamUrl });
  });
  const attachRef = useAttachMedia<HTMLVideoElement>(media);

  return <video ref={attachRef} autoPlay muted playsInline />;
};
