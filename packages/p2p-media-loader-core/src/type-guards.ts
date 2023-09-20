import { PeerCommand } from "./internal-types";
import { PeerCommandType } from "./enums";

export function isPeerCommand(command: object): command is PeerCommand {
  return (
    (command as PeerCommand).c !== undefined &&
    Object.values(PeerCommandType).includes((command as PeerCommand).c)
  );
}
