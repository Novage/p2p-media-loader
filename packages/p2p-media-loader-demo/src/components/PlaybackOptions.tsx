import { useRef } from "react";
import { PLAYERS } from "../constants";
import { PlayerKey, PlayerName } from "../types";

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

  const hlsPlayers: Partial<Record<PlayerKey, PlayerName>> = {};
  const shakaPlayers: Partial<Record<PlayerKey, PlayerName>> = {};

  Object.entries(PLAYERS).forEach(([key, name]) => {
    if (key.includes("hls")) {
      hlsPlayers[key as PlayerKey] = name;
    } else if (key.includes("shaka")) {
      shakaPlayers[key as PlayerKey] = name;
    }
  });

  const handleApply = () => {
    const player = playerSelectRef.current?.value;
    const streamUrl = streamUrlInputRef.current?.value;

    if (player && streamUrl) {
      updatePlaybackOptions(streamUrl, player);
    }
  };

  return (
    <div className="playback-options">
      <div className="option-group">
        <label htmlFor="streamUrl">
          Video URL{isHttps ? " (HTTPS only)" : ""}:
        </label>
        <input
          key={streamUrl}
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
          key={String(currentPlayer)}
          ref={playerSelectRef}
          id="player"
          defaultValue={String(currentPlayer)}
        >
          <optgroup label="Hls.js P2P Engine (HLS Only)">
            {Object.entries(hlsPlayers).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </optgroup>
          {Object.keys(shakaPlayers).length > 0 && (
            <optgroup label="Shaka Players">
              {Object.entries(shakaPlayers).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      <div className="button-group">
        <button type="button" onClick={handleApply}>
          Apply
        </button>
        <button
          type="button"
          onClick={() => {
            window.open(window.location.href, "_blank");
          }}
        >
          Create new peer
        </button>
      </div>
    </div>
  );
};
