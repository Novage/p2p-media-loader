import { Demo } from "p2p-media-loader-demo";
import "./app.css";
import { DebugOptions } from "./DebugOptions";

function App() {
  return (
    <>
      <Demo />

      <div className="container dev-container">
        <DebugOptions />
        <a href="modules-demo/index.html">ES modules demo</a>
      </div>
    </>
  );
}

export default App;
