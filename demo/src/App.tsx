import "./app.css";
import { P2PVideoDemo } from "p2p-media-loader-demo";

export function App() {
  return (
    <P2PVideoDemo
      streamUrl={"https://live.novage.workers.dev/bbb/live.m3u8"}
      debugToolsEnabled={false}
    />
  );
}
