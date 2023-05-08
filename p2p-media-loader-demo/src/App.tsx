import { useState } from "react";
import { Engine as HlsJSEngine } from "p2p-media-loader-hlsjs";
import { Engine as ShakaEngine } from "p2p-media-loader-shaka";

function App() {
  const [count, setCount] = useState(0);

  return (
    <>
      <h1>Vite + React</h1>
      <div>
        <button
          onClick={() =>
            setCount((count) => new HlsJSEngine().increment(count))
          }
        >
          count is {count}
        </button>
      </div>
      <p>Click on the Vite and React logos to learn more</p>
      <p>{ShakaEngine.getText()}</p>
    </>
  );
}

export default App;
