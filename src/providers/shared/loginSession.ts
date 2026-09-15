import { sha256 } from "@noble/hashes/sha2.js";

import type { ProviderLoginResult } from "../../contracts/auth";

export function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError(signal);
}

/** Rejects with the signal's abort error — for racing a wait that does not
 *  itself understand AbortSignal (e.g. a native loopback listener). */
export function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }
    signal.addEventListener("abort", () => reject(abortError(signal)), { once: true });
  });
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(abortError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function describeLoginError(err: unknown, fallback: string): string {
  if (err instanceof DOMException && err.name === "AbortError") return "Sign-in cancelled.";
  return err instanceof Error ? err.message : fallback;
}

function stringMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** Anthropic (and some other OAuth APIs) return `error` as an object, not a string. */
export function oauthErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const record = data as Record<string, unknown>;

  const fromDescription = stringMessage(record.error_description);
  if (fromDescription) return fromDescription;

  const fromError = stringMessage(record.error);
  if (fromError) return fromError;

  if (record.error && typeof record.error === "object") {
    const nested = record.error as Record<string, unknown>;
    const fromNested =
      stringMessage(nested.message) || stringMessage(nested.error_description) || stringMessage(nested.type);
    if (fromNested) return fromNested;
  }

  return stringMessage(record.message) || fallback;
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function randomBase64Url(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64Url(buffer);
}

export function pkceChallenge(verifier: string): string {
  return base64Url(sha256(new TextEncoder().encode(verifier)));
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}



export interface ProviderLoginSession {
  kind: "device_code" | "paste_code" | "browser";
  userCode?: string;
  verificationUri?: string;
  prompt?: string;
  done: Promise<ProviderLoginResult>;
  cancel: () => void;
  /** Paste-code flows: complete sign-in with what the user pasted. */
  submitCode?: (code: string) => void;
}

/** Deliver a pasted code to a waiting `paste_code` session. */
export function submitLoginCode(session: ProviderLoginSession, code: string): void {
  if (!session.submitCode) throw new Error("This sign-in is not waiting for a code.");
  session.submitCode(code);
}
