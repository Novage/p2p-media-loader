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
