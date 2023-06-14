import { useEffect, useRef, useState } from "react";
import { Engine as HlsJsEngine } from "p2p-media-loader-hlsjs";
import Hls from "hls.js";
import DPlayer from "dplayer";

const videoUrl = {
  bigBunnyBuck: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  byteRangeVideo:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8",
  live: "https://fcc3ddae59ed.us-west-2.playback.live-video.net/api/video/v1/us-west-2.893648527354.channel.DmumNckWFTqz.m3u8",
  advancedVideo:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/adv_dv_atmos/main.m3u8",
  advancedVideo2:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_adv_example_hevc/master.m3u8",
  basicExample:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8",
};

const players = ["hlsjs", "dplayer"] as const;
type Player = (typeof players)[number];

function App() {
  const [playerType, setPlayerType] = useState<Player>("dplayer");
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!Hls.isSupported()) return;

    let player: DPlayer | Hls;
    const url = videoUrl.advancedVideo2;
    if (playerType === "dplayer" && containerRef.current) {
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
    } else if (playerType === "hlsjs" && videoRef.current) {
      const engine = new HlsJsEngine();
      const hls = new Hls({
        ...engine.getConfig(),
      });

      hls.loadSource(url);
      hls.attachMedia(videoRef.current);
      player = hls;
    }

    return () => player.destroy();
  }, [playerType]);

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ marginBottom: 20 }}>
        <h1>This is HLS.JS Player Demo</h1>
        <div>
          <select
            value={playerType}
            onChange={(event) => setPlayerType(event.target.value as Player)}
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
