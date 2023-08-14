import { Stream } from "../types";

export function getStreamExternalId(
  stream: Stream,
  manifestResponseUrl: string
): string {
  const { type, index } = stream;
  return `${manifestResponseUrl}-${type}-v${index}`;
}
