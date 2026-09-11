import { handleCommand } from "../mock-commands";
import { logInvoke } from "./runtime";

export async function invoke<T>(cmd: string, args?: unknown): Promise<T> {
  logInvoke(cmd, args);
  return handleCommand(cmd, args) as T;
}
