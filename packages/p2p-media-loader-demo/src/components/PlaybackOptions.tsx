import { useRef } from "react";
import { PLAYERS, DEFAULT_STREAM } from "../constants";
type PlaybackOptions = {
  updatePlaybackOptions: (url: string, player: string) => void;
};

export const PlaybackOptions = ({ updatePlaybackOptions }: PlaybackOptions) => {
  const playerSelectRef = useRef<HTMLSelectElement>(null);
  const streamUrlInputRef = useRef<HTMLInputElement>(null);

  const handleApply = () => {
    const player = playerSelectRef.current?.value;
    const streamUrl = streamUrlInputRef.current?.value;

    if (player && streamUrl) {
      updatePlaybackOptions(streamUrl, player);
    }
  };

  return (
    <div>
      <div>
        <label htmlFor="player">Player:</label>
        <select ref={playerSelectRef} id="player">
          {PLAYERS.map((player) => (
            <option key={player} value={player}>
              {player}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="streamUrl">Stream URL:</label>
        <input
          defaultValue={DEFAULT_STREAM}
          id="streamUrl"
          ref={streamUrlInputRef}
        ></input>
      </div>
      <button onClick={handleApply}>Apply</button>
    </div>
  );
};
