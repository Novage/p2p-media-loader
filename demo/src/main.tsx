import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

// Release tests drive several tabs as one; see specs/release-testing.md. A
// production build drops this branch, and the driver with it.
if (import.meta.env.DEV && new URLSearchParams(location.search).has("driver")) {
  void import("./test-driver").then(({ installTestDriver }) => {
    installTestDriver();
  });
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
