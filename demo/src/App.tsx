import "./app.css";
import { P2PVideoDemo } from "p2p-media-loader-demo";

export function App() {
  return (
    <P2PVideoDemo
      streamUrl={
        "https://fcc3ddae59ed.us-west-2.playback.live-video.net/api/video/v1/us-west-2.893648527354.channel.DmumNckWFTqz.m3u8"
      }
      debugToolsEnabled={false}
    />
  );
}
