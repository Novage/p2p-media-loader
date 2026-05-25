export function getRTCError(
  event: Event,
  fallbackMessage = "RTC error",
): Error {
  const errorEvent = event as { error?: unknown };
  if (errorEvent.error instanceof Error) {
    return errorEvent.error;
  }
  const msg =
    (errorEvent.error as { message?: string } | undefined)?.message ??
    fallbackMessage;
  return new Error(msg);
}

export function getRTCErrorMessage(
  event: Event,
  fallbackMessage = "RTC error",
): string {
  return getRTCError(event, fallbackMessage).message;
}

export function isTerminalConnectionState(
  state: RTCIceConnectionState,
): boolean {
  // "disconnected" is technically a transient ICE state that can recover,
  // but for live video streaming we treat it as terminal: dropping the peer
  // immediately and reconnecting via the tracker is faster than waiting for
  // a stale connection to potentially recover.

  return state === "failed" || state === "closed" || state === "disconnected";
}
