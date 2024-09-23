export const getStorageItemId = (streamId: string, segmentId: number) =>
  `${streamId}|${segmentId}`;

export const isAndroid = (userAgent: string) => /Android/i.test(userAgent);

export const isIPadOrIPhone = (userAgent: string) =>
  /iPad|iPhone/i.test(userAgent);

export const isAndroidWebview = (userAgent: string) =>
  /Android/i.test(userAgent) && !/Chrome|Firefox/i.test(userAgent);
