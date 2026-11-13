// The tests run in Node, which has neither a `window` nor WebRTC. The core
// reads WebRTC from `window` when it loads, and loads nothing through P2P on
// a page without it, so every test gets a stand-in, as every browser the core
// supports has the real one.
const scope = globalThis as { window?: unknown; RTCPeerConnection?: unknown };
scope.RTCPeerConnection ??= class RTCPeerConnection {};
scope.window ??= globalThis;
