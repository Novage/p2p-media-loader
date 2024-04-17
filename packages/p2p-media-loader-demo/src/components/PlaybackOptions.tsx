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

  const isHttps = window.location.protocol === "https:";

  const handleApply = () => {
    const player = playerSelectRef.current?.value;
    const streamUrl = streamUrlInputRef.current?.value;

    if (player && streamUrl) {
      updatePlaybackOptions(streamUrl, player);
    }
  };

  return (
    <>
      <div className="playback-options">
        <div className="option-group">
          <label htmlFor="streamUrl">
            Video URL{isHttps ? " (HTTPS only)" : ""}:
          </label>
          <input
            className="item"
            defaultValue={streamUrl}
            id="streamUrl"
            ref={streamUrlInputRef}
          ></input>
        </div>

        <div className="option-group">
          <label htmlFor="player">Player:</label>
          <select
            className="item"
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

        <div className="button-group">
          <button onClick={handleApply}>Apply</button>
          <button
            onClick={() => {
              window.open(window.location.href, "_blank");
            }}
          >
            Create new peer
          </button>
        </div>
      </div>
    </>
  );
};
