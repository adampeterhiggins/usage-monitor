import * as React from "react";
import { LoaderCircle, Ticket } from "lucide-react";
import { PROVIDERS } from "../../providers/metadata";
import type { AccountPublic } from "../../contracts/accounts";
import type { ResetCredits, ResetOutcome } from "../../contracts/resets";
import { formatExpiry } from "../../lib/usage/format";
import { readResetCredits, redeemResetCredit } from "../../lib/usage/resets";
import { toast } from "../ui/toast";
import { Button } from "../ui/button";
import { Text } from "../ui/text";

const OUTCOME_TEXT: Record<ResetOutcome, string> = {
  reset: "Reset applied. Your windows have cleared.",
  nothingToReset: "Nothing to reset right now.",
  noCredit: "No reset credit left.",
  alreadyRedeemed: "That credit was already redeemed.",
};

type LoadState =
  | { status: "loading" }
  | { status: "ok"; credits: ResetCredits }
  | { status: "error"; message: string };

interface ResetCreditsDialogProps {
  account: AccountPublic;
  onClose: () => void;
  onReset: (account: AccountPublic) => void;
}

export function resetCreditsSummary(credits: ResetCredits): string {
  if (credits.availableCount === 0) return "No reset credits banked";
  const expiry = formatExpiry(credits.nextExpiresAt);
  const noun = credits.availableCount === 1 ? "reset credit" : "reset credits";
  return `${credits.availableCount} ${noun} banked${expiry ? ` · next ${expiry}` : ""}`;
}

/** Banked usage resets for one account. Redeeming spends a credit the
 *  provider granted, so it never fires without a second confirm. */
export function ResetCreditsDialog({ account, onClose, onReset }: ResetCreditsDialogProps) {
  const meta = PROVIDERS[account.provider];
  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ok", credits: await readResetCredits(account.id) });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [account.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function redeem(credits: ResetCredits) {
    setConfirming(false);
    setBusy(true);
    setStatus(null);
    try {
      const outcome = await redeemResetCredit(account.id, credits);
      setStatus(OUTCOME_TEXT[outcome]);
      if (outcome === "reset") {
        toast.success("Usage reset", { description: `${meta.name} · ${account.label}` });
        onReset(account);
      }
      void load();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not use the reset credit.");
    } finally {
      setBusy(false);
    }
  }

  const credits = state.status === "ok" ? state.credits : undefined;
  const canRedeem = !!credits && credits.availableCount > 0 && !busy;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center rounded-[16px] bg-ui-scrim p-6">
      <div
        data-ui-surface="menu"
        role="dialog"
        aria-label="Usage resets"
        className="ui-surface w-full max-w-sm rounded-2xl p-4 shadow-xl ring-1 ring-ui-subtle"
      >
        <div className="text-[15px] font-semibold">
          {confirming ? "Use a reset credit?" : "Usage resets"}
        </div>
        <p className="mt-1 text-[12px] text-ui-secondary">
          {confirming
            ? "This redeems one credit on your account and clears the current rate-limit windows. It cannot be undone."
            : `${meta.name} · ${account.label}`}
        </p>

        {confirming ? null : (
          <div className="mt-3 flex min-h-[40px] items-center gap-2">
            {state.status === "loading" ? (
              <>
                <LoaderCircle className="size-4 animate-spin text-ui-tertiary" />
                <Text variant="small" color="secondary">
                  Checking banked resets…
                </Text>
              </>
            ) : state.status === "error" ? (
              <Text variant="small" color="red" className="line-clamp-3">
                {state.message}
              </Text>
            ) : (
              <>
                <Ticket className="size-4 shrink-0 text-ui-tertiary" />
                <Text variant="small" className="tabular-nums">
                  {resetCreditsSummary(state.credits)}
                </Text>
              </>
            )}
          </div>
        )}

        {status && !confirming ? (
          <Text variant="small" color="secondary" className="mt-1 block">
            {status}
          </Text>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          {confirming ? (
            <>
              <Button variant="glass" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button variant="accent" onClick={() => credits && void redeem(credits)}>
                Use credit
              </Button>
            </>
          ) : (
            <>
              {state.status === "error" ? (
                <Button variant="glass" onClick={() => void load()}>
                  Try again
                </Button>
              ) : null}
              <Button variant="glass" disabled={busy} onClick={onClose}>
                Close
              </Button>
              <Button variant="accent" disabled={!canRedeem} onClick={() => setConfirming(true)}>
                {busy ? "Using…" : "Use reset"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
