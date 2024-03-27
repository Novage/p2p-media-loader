import { useRef } from "react";
import { PLAYERS } from "../constants";
type PlaybackOptions = {
  currentPlayer: string;
  streamUrl: string;
};

export const PlaybackOptions = ({
  currentPlayer,
  streamUrl,
}: PlaybackOptions) => {
  const playerSelectRef = useRef<HTMLSelectElement>(null);
  const streamUrlInputRef = useRef<HTMLInputElement>(null);

  const handleApply = () => {
    const player = playerSelectRef.current?.value;
    const streamUrl = streamUrlInputRef.current?.value;

    const newUrl = `${window.location.pathname}?player=${player}&streamUrl=${streamUrl}`;
    window.history.pushState({}, "", newUrl);
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
