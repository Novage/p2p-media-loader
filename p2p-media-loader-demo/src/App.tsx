import { useEffect, useRef } from "react";
import { Engine } from "p2p-media-loader-hlsjs";
import DPlayer from "dplayer";

const bigBunnyBuck = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
const anotherVideo =
  "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8";
const byteRangeVideo =
  "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8";

function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const engine = new Engine();
    const hls = engine.createHlsInstance();
    if (!container || !hls) return;

    const player = new DPlayer({
      container: container,
      video: {
        url: bigBunnyBuck,
        type: "customHls",
        customType: {
          customHls: (video: HTMLVideoElement) => {
            hls.loadSource(video.src);
            hls.attachMedia(video);
          },
        },
      },
    });
  }, [containerRef]);

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ marginBottom: 20 }}>
        <h1>This is HLS.JS Player Demo</h1>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div ref={containerRef} style={{ width: 1000 }} />
      </div>
    </div>
  );
}

export default App;
