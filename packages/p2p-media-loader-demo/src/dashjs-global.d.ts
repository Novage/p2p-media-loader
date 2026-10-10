declare global {
  interface Window {
    /** The dash.js global that OpenPlayerJS and MediaElement build their players from. */
    dashjs?: unknown;
  }
}

export {};
