import type shakaType from "shaka-player/dist/shaka-player.compiled";
import "./demo.css";
import { PlaybackOptions } from "./PlaybackOptions";
import {
  compatibleStreamUrl,
  DEBUG_COMPONENT_ENABLED,
  PLAYERS,
} from "../constants";
import { useQueryParams } from "../hooks/useQueryParams";
import { HlsjsPlayer } from "./players/hlsjs/Hlsjs";
import { useCallback, useMemo, useRef, useState } from "react";
import { DownloadStatsChart } from "./chart/DownloadStatsChart";
import { NodeNetwork } from "./nodeNetwork/NodeNetwork";
import { DebugTools } from "./debugTools/DebugTools";
import { PlayerKey } from "../types";
import { HlsjsDPlayer } from "./players/hlsjs/HlsjsDPLayer";
import { HlsjsClapprPlayer } from "./players/hlsjs/HlsjsClapprPlayer";
import { HlsjsPlyr } from "./players/hlsjs/HlsjsPlyr";
import { HlsjsOpenPlayer } from "./players/hlsjs/HlsjsOpenPlayer";
import { Shaka } from "./players/shaka/Shaka";
import { ShakaDPlayer } from "./players/shaka/ShakaDPlayer";
import { ShakaClappr } from "./players/shaka/ShakaClappr";
import { HlsjsMediaElement } from "./players/hlsjs/HlsjsMediaElement";
import { ShakaPlyr } from "./players/shaka/ShakaPlyr";
import { HlsJsP2PEngine } from "p2p-media-loader-hlsjs";
import { HlsjsVidstack } from "./players/hlsjs/HlsjsVidstack";
import { PeerDetails } from "p2p-media-loader-core";
import { HlsjsVidstackIndexedDB } from "./players/hlsjs/HlsjsVidstackIndexedDB";
import { DashJs } from "./players/dashjs/DashJs";
import { DashJsVidstack } from "./players/dashjs/DashJsVidstack";
import { DashJsDPlayer } from "./players/dashjs/DashJsDPlayer";
import { DashJsPlyr } from "./players/dashjs/DashJsPlyr";
import { DashJsMediaElement } from "./players/dashjs/DashJsMediaElement";
import { VideoJs } from "./players/videojs/VideoJs";

type DemoProps = {
  streamUrl?: string;
  debugToolsEnabled?: boolean;
};

type HlsWithP2PType = ReturnType<typeof HlsJsP2PEngine.injectMixin>;

declare global {
  interface Window {
    shaka: typeof shakaType;
    Hls?: HlsWithP2PType;
    LevelSelector: unknown;
    DashShakaPlayback: unknown;
    Clappr: {
      Player: unknown;
    };
  }
}

const playerComponents = {
  openPlayer_hls: HlsjsOpenPlayer,
  plyr_hls: HlsjsPlyr,
  clappr_hls: HlsjsClapprPlayer,
  dplayer_hls: HlsjsDPlayer,
  hlsjs_hls: HlsjsPlayer,
  vidstack_indexeddb_hls: HlsjsVidstackIndexedDB,
  shaka: Shaka,
  dplayer_shaka: ShakaDPlayer,
  clappr_shaka: ShakaClappr,
  mediaElement_hls: HlsjsMediaElement,
  plyr_shaka: ShakaPlyr,
  vidstack_hls: HlsjsVidstack,
  vidstack_dashjs: DashJsVidstack,
  dashjs: DashJs,
  dplayer_dashjs: DashJsDPlayer,
  plyr_dashjs: DashJsPlyr,
  mediaElement_dashjs: DashJsMediaElement,
  videojs: VideoJs,
} as const;

type PeerState = {
  peerId: string;
  infoHash: string;
};

export const P2PVideoDemo = ({
  streamUrl,
  debugToolsEnabled = false,
}: DemoProps) => {
  const data = useRef({
    httpDownloaded: 0,
    p2pDownloaded: 0,
    p2pUploaded: 0,
  });

  const { queryParams, setURLQueryParams } = useQueryParams(streamUrl);

  const trackers = useMemo(
    () => queryParams.trackers.split(","),
    [queryParams.trackers],
  );

  const [peers, setPeers] = useState<PeerState[]>([]);

  const uniquePeerIds = useMemo(
    () => Array.from(new Set(peers.map((p) => p.peerId))),
    [peers],
  );

  const onChunkDownloaded = useCallback(
    (bytesLength: number, downloadSource: string) => {
      switch (downloadSource) {
        case "http":
          data.current.httpDownloaded += bytesLength;
          break;
        case "p2p":
          data.current.p2pDownloaded += bytesLength;
          break;
        default:
          break;
      }
    },
    [],
  );

  const onChunkUploaded = useCallback((bytesLength: number) => {
    data.current.p2pUploaded += bytesLength;
  }, []);

  // Peers are drawn whichever swarm they share — a stream where only the
  // audio is sharable (a SegmentBase video with a WebM index, say) still
  // has peers. The graph dedupes by peer id, so a peer on both swarms shows once.
  const onPeerConnect = useCallback((params: PeerDetails) => {
    setPeers((peers) => {
      return [...peers, { peerId: params.peerId, infoHash: params.infoHash }];
    });
  }, []);

  const onPeerClose = useCallback((params: PeerDetails) => {
    setPeers((peers) => {
      return peers.filter(
        (peer) =>
          !(peer.peerId === params.peerId && peer.infoHash === params.infoHash),
      );
    });
  }, []);

  const handlePlaybackOptionsUpdate = (url: string, player: string) => {
    if (!(player in PLAYERS)) return;
    setURLQueryParams({ streamUrl: compatibleStreamUrl(player, url), player });
  };

  // A player selected through the URL, or persisted from a previous visit,
  // may not play the persisted stream: a dash.js player with the HLS default.
  const streamUrlForPlayer = compatibleStreamUrl(
    queryParams.player,
    queryParams.streamUrl,
  );

  const coreOptions = useMemo(
    () => ({
      announceTrackers: trackers,
      swarmId: queryParams.swarmId === "" ? undefined : queryParams.swarmId,
      httpDownloadInitialTimeoutMs: 3000,
    }),
    [trackers, queryParams.swarmId],
  );

  const renderPlayer = () => {
    const PlayerComponent = playerComponents[
      queryParams.player as PlayerKey
    ] as (typeof playerComponents)[PlayerKey] | undefined;

    return PlayerComponent ? (
      <PlayerComponent
        streamUrl={streamUrlForPlayer}
        coreOptions={coreOptions}
        onPeerConnect={onPeerConnect}
        onPeerClose={onPeerClose}
        onChunkDownloaded={onChunkDownloaded}
        onChunkUploaded={onChunkUploaded}
      />
    ) : null;
  };

  const isDebugToolsEnabled =
    debugToolsEnabled || queryParams.debug === DEBUG_COMPONENT_ENABLED;

  return (
    <>
      <div className="demo-container">
        <div className="column-1">
          {renderPlayer()}
          <DownloadStatsChart downloadStatsRef={data} />
        </div>

        <div className="column-2">
          <div style={{ display: "flex" }}>
            <PlaybackOptions
              updatePlaybackOptions={handlePlaybackOptionsUpdate}
              currentPlayer={queryParams.player}
              streamUrl={streamUrlForPlayer}
            />
          </div>

          <NodeNetwork peers={uniquePeerIds} />

          {trackers.length > 0 && (
            <div className="trackers-container">
              <span>Trackers:</span>
              <ul className="trackers-list">
                {trackers.map((tracker) => (
                  <li key={tracker}>{tracker}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      {isDebugToolsEnabled && <DebugTools />}
    </>
  );
};
