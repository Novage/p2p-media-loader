import { useState } from "react";
import { Engine } from "p2p-media-loader-hlsjs";

function App() {
  const [count, setCount] = useState(0);

  return (
    <>
      <h1>Vite + React</h1>
      <div>
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
      </div>
      <p>Click on the Vite and React logos to learn more</p>
      <p>{Engine.getText()}</p>
    </>
  );
}

export default App;
