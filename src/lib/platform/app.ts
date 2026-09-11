/** Application lifecycle: version, exit, relaunch. */

import { getVersion } from "@tauri-apps/api/app";
import { exit, relaunch } from "@tauri-apps/plugin-process";

export async function appVersion(): Promise<string> {
  return getVersion();
}

export async function exitApp(): Promise<void> {
  await exit(0);
}

export async function restartApp(): Promise<void> {
  await relaunch();
}
