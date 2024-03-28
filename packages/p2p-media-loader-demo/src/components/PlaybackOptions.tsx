import { useRef } from "react";
import { PLAYERS } from "../constants";
type PlaybackOptions = {
  updatePlaybackOptions: (url: string, player: string) => void;
  currentPlayer: string;
  streamUrl: string;
};

export const PlaybackOptions = ({
  updatePlaybackOptions,
  currentPlayer,
  streamUrl,
}: PlaybackOptions) => {
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

        <select
          key={currentPlayer}
          ref={playerSelectRef}
          id="player"
          defaultValue={currentPlayer}
        >
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
          defaultValue={streamUrl}
          id="streamUrl"
          ref={streamUrlInputRef}
        ></input>
      </div>
      <button onClick={handleApply}>Apply</button>
    </div>
  );
};
