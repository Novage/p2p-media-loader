import { useRef } from "react";

type PlaybackOptions = {
  updatePlaybackOptions: (url: string, player: string) => void;
};

export const PlaybackOptions = ({ updatePlaybackOptions }: PlaybackOptions) => {
  const playerSelectRef = useRef<HTMLSelectElement>(null);
  const streamUrlSelectRef = useRef<HTMLSelectElement>(null);

  const handleApply = () => {
    const player = playerSelectRef.current?.value;
    const streamUrl = streamUrlSelectRef.current?.value;

    if (player && streamUrl) {
      updatePlaybackOptions(streamUrl, player);
    }
  };

  return (
    <div>
      <div>
        <label htmlFor="player">Player:</label>
        <select ref={playerSelectRef} id="player">
          <option value="hlsjs">hls.js</option>
          <option value="hlsjs-dplayer">hls.js + DPlayer</option>
        </select>
      </div>
      <div>
        <label htmlFor="streamUrl">Stream URL:</label>
        <select ref={streamUrlSelectRef} id="streamUrl">
          <option value="https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8">
            Big Buck Bunny
          </option>
          <option value="https://devstreaming-cdn.apple.com/videos/streaming/examples/adv_dv_atmos/main.m3u8">
            Sintel
          </option>
        </select>
      </div>
      <button onClick={handleApply}>Apply</button>
    </div>
  );
};
