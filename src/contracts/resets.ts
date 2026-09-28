/** Banked usage-reset credits — Claude's `cedar_ember` grants and Codex's
 *  rate-limit reset credits. Redeeming one clears the account's current
 *  rate-limit windows. */

export interface ResetCredits {
  availableCount: number;
  /** Epoch ms when the next credit to be spent expires. */
  nextExpiresAt?: number;
  /** The provider's id for the credit a redeem would spend, when it names one. */
  nextCreditId?: string;
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
