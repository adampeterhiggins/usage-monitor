/** Banked usage-reset credits — Claude's `cedar_ember` grants and Codex's
 *  rate-limit reset credits. Redeeming one clears the account's current
 *  rate-limit windows. */

/** One banked credit. A Claude grant can hold several resets; a Codex
 *  credit is always one. */
export interface ResetCredit {
  id: string;
  resetsLeft: number;
  /** Epoch ms. */
  expiresAt?: number;
  title?: string;
  /** False for credits the provider lists but will not redeem yet (paused or
   *  not yet usable). They are shown but not counted. */
  usable: boolean;
}

export interface ResetCredits {
  availableCount: number;
  /** Epoch ms when the next credit to be spent expires. */
  nextExpiresAt?: number;
  /** The provider's id for the credit a redeem would spend, when it names one. */
  nextCreditId?: string;
  /** Every banked credit, soonest-expiring first. May be empty while
   *  `availableCount` is not, when the provider sends only a count. */
  credits: ResetCredit[];
}

export function bySoonestExpiry(a: ResetCredit, b: ResetCredit): number {
  return (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity);
}

export type ResetOutcome = "reset" | "nothingToReset" | "noCredit" | "alreadyRedeemed";

/** A failed read or redeem. `settled` means the provider gave a final answer
 *  (or nothing was sent), so a retry is a new attempt rather than the same one. */
export class ResetCreditError extends Error {
  settled: boolean;

  constructor(message: string, settled: boolean) {
    super(message);
    this.name = "ResetCreditError";
    this.settled = settled;
  }
}
