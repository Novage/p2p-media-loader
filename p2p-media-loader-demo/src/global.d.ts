declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Clappr: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    LevelSelector: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    DashShakaPlayback: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    shaka: any;
  }
}

export {};
