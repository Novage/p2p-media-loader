interface LegacyBrowserWindow extends Window {
  RTCPeerConnection?: typeof RTCPeerConnection;
  webkitRTCPeerConnection?: typeof RTCPeerConnection;
  mozRTCPeerConnection?: typeof RTCPeerConnection;
  RTCSessionDescription?: typeof RTCSessionDescription;
  webkitRTCSessionDescription?: typeof RTCSessionDescription;
  mozRTCSessionDescription?: typeof RTCSessionDescription;
}

// Since this library runs exclusively in the browser window context, we target
// the global 'window' directly. We use a fallback to an empty object for SSR/testing environments.
const win = (typeof window !== "undefined"
  ? window
  : {}) as unknown as LegacyBrowserWindow;

export const PeerConnection = (win.RTCPeerConnection ??
  win.webkitRTCPeerConnection ??
  win.mozRTCPeerConnection) as unknown as typeof RTCPeerConnection;

export const SessionDescription = (win.RTCSessionDescription ??
  win.webkitRTCSessionDescription ??
  win.mozRTCSessionDescription) as unknown as typeof RTCSessionDescription;

type LegacyRTCPeerConnection = Omit<
  RTCPeerConnection,
  | "createOffer"
  | "createAnswer"
  | "setLocalDescription"
  | "setRemoteDescription"
> & {
  createOffer(
    successCallback: (offer: RTCSessionDescriptionInit) => void,
    failureCallback: (error: Error) => void,
    options?: RTCOfferOptions,
  ): void;
  createAnswer(
    successCallback: (answer: RTCSessionDescriptionInit) => void,
    failureCallback: (error: Error) => void,
    options?: RTCAnswerOptions,
  ): void;
  setLocalDescription(
    description: RTCSessionDescriptionInit,
    successCallback: () => void,
    failureCallback: (error: Error) => void,
  ): void;
  setRemoteDescription(
    description: RTCSessionDescriptionInit,
    successCallback: () => void,
    failureCallback: (error: Error) => void,
  ): void;
};

/**
 * Detects whether the current browser environment natively supports Promise-based WebRTC APIs
 * (specifically pc.createOffer and pc.createAnswer).
 *
 * For example:
 * - Chrome < 50: Callback-only for all WebRTC APIs.
 * - Chrome 50: Promise support for setLocalDescription/setRemoteDescription, but callback-only for createOffer/createAnswer.
 * - Chrome 51+: Promise support for all WebRTC APIs.
 *
 * Probing this statically once at startup prevents the need to repeatedly execute throw/catch blocks
 * during runtime connection negotiations, avoiding unnecessary exception-handling overhead.
 */
const supportsPromiseWebRTC = (() => {
  // Guard for SSR/test environments where no WebRTC APIs exist
  if (
    !win.RTCPeerConnection &&
    !win.webkitRTCPeerConnection &&
    !win.mozRTCPeerConnection
  ) {
    return false;
  }
  let pc: RTCPeerConnection | undefined;
  try {
    pc = new PeerConnection();
    const p = pc.createOffer();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof p?.then === "function") {
      p.catch(() => {
        /* suppress unhandled rejection from probe */
      });
      return true;
    }
  } catch {
    // Fallback to legacy callback-based APIs
  } finally {
    try {
      pc?.close();
    } catch {
      // ignore
    }
  }
  return false;
})();

/**
 * Safe, backward-compatible wrapper for RTCPeerConnection.createOffer.
 *
 * Falls back to legacy callback-based signature on older engines (like Chrome 50 and below)
 * while leveraging native Promises on modern browsers, avoiding runtime throwing or exception latency.
 */
export function safeCreateOffer(
  pc: RTCPeerConnection,
  options?: RTCOfferOptions,
): Promise<RTCSessionDescriptionInit> {
  if (supportsPromiseWebRTC) {
    return pc.createOffer(options);
  }
  return new Promise((resolve, reject) => {
    try {
      (pc as LegacyRTCPeerConnection).createOffer(resolve, reject, options);
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      reject(err);
    }
  });
}

/**
 * Safe, backward-compatible wrapper for RTCPeerConnection.createAnswer.
 *
 * Falls back to legacy callback-based signature on older engines (like Chrome 50 and below)
 * while leveraging native Promises on modern browsers, avoiding runtime throwing or exception latency.
 */
export function safeCreateAnswer(
  pc: RTCPeerConnection,
  options?: RTCAnswerOptions,
): Promise<RTCSessionDescriptionInit> {
  if (supportsPromiseWebRTC) {
    return pc.createAnswer(options);
  }
  return new Promise((resolve, reject) => {
    try {
      (pc as LegacyRTCPeerConnection).createAnswer(resolve, reject, options);
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      reject(err);
    }
  });
}

/**
 * Safe, backward-compatible wrapper for RTCPeerConnection.setLocalDescription.
 *
 * Falls back to legacy callback-based signature on older engines (like Chrome < 50)
 * while leveraging native Promises on modern browsers.
 */
export function safeSetLocalDescription(
  pc: RTCPeerConnection,
  description: RTCSessionDescriptionInit,
): Promise<void> {
  if (supportsPromiseWebRTC) {
    return pc.setLocalDescription(description);
  }
  return new Promise((resolve, reject) => {
    try {
      (pc as LegacyRTCPeerConnection).setLocalDescription(
        description,
        resolve,
        reject,
      );
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      reject(err);
    }
  });
}

/**
 * Safe, backward-compatible wrapper for RTCPeerConnection.setRemoteDescription.
 *
 * Falls back to legacy callback-based signature on older engines (like Chrome < 50)
 * while leveraging native Promises on modern browsers.
 */
export function safeSetRemoteDescription(
  pc: RTCPeerConnection,
  description: RTCSessionDescriptionInit,
): Promise<void> {
  if (supportsPromiseWebRTC) {
    return pc.setRemoteDescription(description);
  }
  return new Promise((resolve, reject) => {
    try {
      (pc as LegacyRTCPeerConnection).setRemoteDescription(
        description,
        resolve,
        reject,
      );
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      reject(err);
    }
  });
}
