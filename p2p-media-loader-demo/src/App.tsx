import { useEffect, useRef, useState } from "react";
import { Engine as HlsJSEngine } from "p2p-media-loader-hlsjs";
import DPlayer from "dplayer";

const bigBunnyBuck = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
const anotherVideo =
  "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8";
const byteRangeVideo =
  "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8";

function App() {
  const [displayVideo, setDisplayVideo] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const hls = HlsJSEngine.getHlsInstance();
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
  }, [containerRef, displayVideo]);

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ marginBottom: 20 }}>
        <h1>This is HLS.JS Player Demo</h1>
        <button
          onClick={() => setDisplayVideo((prev) => !prev)}
          style={{ fontSize: 20, padding: "10px 15px" }}
        >
          {displayVideo ? "Hide" : "Show"}
        </button>
      </div>

      {displayVideo && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div ref={containerRef} style={{ width: 1000 }} />
        </div>
      )}
    </div>
  );
}

export default App;
