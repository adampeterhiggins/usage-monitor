/** Banked usage-reset credits — Claude's `cedar_ember` grants and
 *  `juniper_tide` session resets, and Codex's rate-limit reset credits.
 *  Redeeming one clears some or all of the account's rate-limit windows. */

/** One banked credit. A Claude grant can hold several resets; a Codex
 *  credit is always one. */
export interface ResetCredit {
  id: string;
  resetsLeft: number;
  /** Epoch ms. */
  expiresAt?: number;
  /** The kind of reset, e.g. "Full reset" or "5-hour reset". */
  title?: string;
  /** The limits redeeming refills, e.g. "5-hour and weekly limits". Absent
   *  when the provider does not say, in which case it clears every window. */
  refills?: string;
  /** False for credits that cannot be redeemed right now. */
  usable: boolean;
  /** Why an unusable credit cannot be redeemed, e.g. "paused". */
  blockedReason?: string;
  /** Epoch ms when an unusable credit becomes usable, when the provider says. */
  usableAt?: number;
}

export interface ResetCredits {
  /** Resets in hand: everything listed except paused, not-yet-started, and
   *  already-spent credits. A credit held back only because it does not
   *  cover the limit the account is at still counts. */
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
