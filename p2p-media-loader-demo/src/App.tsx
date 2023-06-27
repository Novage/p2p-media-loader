import { useEffect, useRef, useState } from "react";
import { Engine as HlsJsEngine } from "p2p-media-loader-hlsjs";
import { Engine as ShakaEngine } from "p2p-media-loader-shaka";
import Hls from "hls.js";
import DPlayer from "dplayer";
import shaka from "shaka-player";
import muxjs from "mux.js";

window.muxjs = muxjs;

const videoUrl = {
  bigBunnyBuck: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  byteRangeVideo:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8",
  live: "https://fcc3ddae59ed.us-west-2.playback.live-video.net/api/video/v1/us-west-2.893648527354.channel.DmumNckWFTqz.m3u8",
  advancedVideo:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/adv_dv_atmos/main.m3u8",
  advancedVideo2:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_adv_example_hevc/master.m3u8",
  advancedVideo3:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8",
  advancedVideo4:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
  basicExample:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8",
  bigBunnyBuckDash: "https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd",
  live2: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8",
  dashLiveWithSeparateVideoAudio:
    "https://livesim.dashif.org/livesim/testpic_2s/Manifest.mpd",
};

const players = ["hlsjs", "dplayer", "shaka-dplayer"] as const;
type Player = (typeof players)[number];
self.shaka = shaka;

function App() {
  const [playerType, setPlayerType] = useState<Player | undefined>(
    localStorage.player
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!Hls.isSupported() || (window as any).player) return;
    if (!localStorage.player) {
      localStorage.player = "dplayer";
      setPlayerType("dplayer");
    }
    let player: DPlayer | Hls;
    const url = videoUrl.live;

    switch (playerType) {
      case "dplayer": {
        player = new DPlayer({
          container: containerRef.current,
          video: {
            url,
            type: "customHls",
            customType: {
              customHls: (video: HTMLVideoElement) => {
                const engine = new HlsJsEngine();
                const hls = new Hls({
                  ...engine.getConfig(),
                });
                hls.loadSource(video.src);
                hls.attachMedia(video);
              },
            },
          },
        });
        break;
      }
      case "shaka-dplayer":
        // shaka.polyfill.installAll();
        player = new DPlayer({
          container: containerRef.current,
          video: {
            url,
            type: "customHlsOrDash",
            customType: {
              customHlsOrDash: (video: HTMLVideoElement) => {
                const engine = new ShakaEngine();

                const src = video.src;
                const shakaPlayer = new shaka.Player(video);
                const onError = function (error: { code: number }) {
                  console.error("Error code", error.code, "object", error);
                };
                shakaPlayer.addEventListener("error", (event: any) => {
                  onError(event);
                });
                engine.initShakaPlayer(shakaPlayer);
                shakaPlayer.load(src).catch(onError);
              },
            },
          },
        });
        (window as any).player = player;
        break;
      case "hlsjs":
        if (videoRef.current) {
          const engine = new HlsJsEngine();
          const hls = new Hls({
            ...engine.getConfig(),
          });
          hls.loadSource(url);
          hls.attachMedia(videoRef.current);
          player = hls;
        }
        break;
    }
  }, [playerType]);

  const setPlayer = (player: Player) => {
    localStorage.player = player;
    setPlayerType(player);
  };

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ marginBottom: 20 }}>
        <h1>This is HLS.JS Player Demo</h1>
        <div>
          <select
            value={playerType}
            onChange={(event) => setPlayer(event.target.value as Player)}
          >
            {players.map((player) => {
              return (
                <option key={player} value={player}>
                  {player}
                </option>
              );
            })}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          ref={containerRef}
          id="player-container"
          style={{ width: 1000 }}
        ></div>
      </div>
      {playerType === "hlsjs" && <video ref={videoRef} controls muted></video>}
    </div>
  );
}

export default App;
