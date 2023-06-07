import { useEffect, useRef, useState } from "react";
import { Engine as HlsJsEngine } from "p2p-media-loader-hlsjs";
import Hls from "hls.js";
import DPlayer from "dplayer";

const videoUrl = {
  bigBunnyBuck: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  byteRangeVideo:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8",
  live: "https://fcc3ddae59ed.us-west-2.playback.live-video.net/api/video/v1/us-west-2.893648527354.channel.DmumNckWFTqz.m3u8",
};

enum Player {
  DPlayer = "DPlayer",
  HjlJS = "HjlJS",
}

function App() {
  const [playerType, setPlayerType] = useState<Player>(Player.DPlayer);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!Hls.isSupported()) return;

    let player: DPlayer | Hls;
    const url = videoUrl.live;
    if (playerType === Player.DPlayer && containerRef.current) {
      const engine = new HlsJsEngine();
      const hls = new Hls({
        ...engine.getConfig(),
      });

      player = new DPlayer({
        container: containerRef.current,
        video: {
          url,
          type: "customHls",
          customType: {
            customHls: (video: HTMLVideoElement) => {
              hls.loadSource(video.src);
              hls.attachMedia(video);
            },
          },
        },
      });
    } else if (playerType === Player.HjlJS && videoRef.current) {
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
            {Object.values(Player).map((player) => {
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
      {playerType === Player.HjlJS && (
        <video ref={videoRef} controls muted></video>
      )}
    </div>
  );
}

export default App;
