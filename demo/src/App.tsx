import "./app.css";
import { P2PVideoDemo } from "p2p-media-loader-demo";

export function App() {
  return (
    <P2PVideoDemo
      streamUrl={
        "https://hls-harbor-livepush.akamaized.net/live_cdn/nsqIStpj8PaG-Ev/emcQJ0pGpremocy/index.m3u8"
      }
      debugToolsEnabled={false}
    />
  );
}
