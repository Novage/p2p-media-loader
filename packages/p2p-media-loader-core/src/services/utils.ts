import { Stream } from "../types";

export function getStreamGlobalId(
  stream: Stream,
  manifestResponseUrl: string
): string {
  const { type, index } = stream;
  return `${manifestResponseUrl}-${type}-v${index}`;
}
