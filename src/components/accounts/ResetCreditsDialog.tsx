import * as React from "react";
import { LoaderCircle, Ticket } from "lucide-react";
import { PROVIDERS } from "../../providers/metadata";
import type { AccountPublic } from "../../contracts/accounts";
import type { ResetCredit, ResetCredits, ResetOutcome } from "../../contracts/resets";
import { formatExpiry, formatUsableAt } from "../../lib/usage/format";
import { readResetCredits, redeemResetCredit } from "../../lib/usage/resets";
import { useResetCreditsStore } from "../../state/resetCredits";
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

/** A redeemable row. `creditId` is absent when the provider sent only a
 *  count, and the provider then picks the credit. */
interface ResetRow {
  key: string;
  creditId?: string;
  label: string;
  detail?: string;
  /** What redeeming refills, when the provider says. */
  refills?: string;
  usable: boolean;
}

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

function creditRow(credit: ResetCredit): ResetRow {
  const label =
    credit.title ?? (credit.resetsLeft === 1 ? "Reset credit" : `${credit.resetsLeft} resets`);
  const detail = [
    credit.title && credit.resetsLeft > 1 ? `${credit.resetsLeft} resets` : undefined,
    credit.usable
      ? undefined
      : (formatUsableAt(credit.usableAt) ?? credit.blockedReason ?? "not usable yet"),
    formatExpiry(credit.expiresAt) ?? "no expiry",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    key: credit.id,
    creditId: credit.id,
    label,
    detail,
    refills: credit.refills,
    usable: credit.usable,
  };
}

function resetRows(credits: ResetCredits): ResetRow[] {
  if (credits.credits.length > 0) return credits.credits.map(creditRow);
  if (credits.availableCount === 0) return [];
  return [{ key: "any", label: resetCreditsSummary(credits), usable: true }];
}

/** Banked usage resets for one account, one button per credit. Redeeming
 *  spends a credit the provider granted, so it never fires without a second
 *  confirm. */
export function ResetCreditsDialog({ account, onClose, onReset }: ResetCreditsDialogProps) {
  const meta = PROVIDERS[account.provider];
  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  const [confirming, setConfirming] = React.useState<ResetRow | null>(null);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setState({ status: "loading" });
    try {
      const credits = await readResetCredits(account.id);
      setState({ status: "ok", credits });
      const cache = useResetCreditsStore.getState();
      void cache.record(account.id, credits).then(() => cache.acknowledge(account.id));
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [account.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function redeem(row: ResetRow) {
    setConfirming(null);
    setBusyKey(row.key);
    setStatus(null);
    try {
      const outcome = await redeemResetCredit(account.id, row.creditId);
      setStatus(
        outcome === "reset" && row.refills
          ? `Reset applied. Your ${row.refills} refilled.`
          : OUTCOME_TEXT[outcome],
      );
      if (outcome === "reset") {
        toast.success("Usage reset", { description: `${meta.name} · ${account.label}` });
        onReset(account);
      }
      void load();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not use the reset credit.");
    } finally {
      setBusyKey(null);
    }
  }

  const busy = busyKey !== null;
  const rows = state.status === "ok" ? resetRows(state.credits) : [];

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
            ? `This redeems one credit on your account and ${
                confirming.refills
                  ? `refills your ${confirming.refills}`
                  : "clears the current rate-limit windows"
              }. It cannot be undone.`
            : `${meta.name} · ${account.label}`}
        </p>

        {confirming ? (
          <div className="mt-3 flex items-center gap-2">
            <Ticket className="size-4 shrink-0 text-ui-tertiary" />
            <Text variant="small" className="tabular-nums">
              {confirming.detail ? `${confirming.label} · ${confirming.detail}` : confirming.label}
            </Text>
          </div>
        ) : (
          <div className="mt-3 flex min-h-[40px] flex-col justify-center gap-2">
            {state.status === "loading" ? (
              <div className="flex items-center gap-2">
                <LoaderCircle className="size-4 animate-spin text-ui-tertiary" />
                <Text variant="small" color="secondary">
                  Checking banked resets…
                </Text>
              </div>
            ) : state.status === "error" ? (
              <Text variant="small" color="red" className="line-clamp-3">
                {state.message}
              </Text>
            ) : (
              <>
                {rows.length > 1 || rows[0]?.creditId ? (
                  <Text variant="small" color="secondary" className="tabular-nums">
                    {resetCreditsSummary(state.credits)}
                  </Text>
                ) : null}
                {rows.length === 0 ? (
                  <div className="flex items-center gap-2">
                    <Ticket className="size-4 shrink-0 text-ui-tertiary" />
                    <Text variant="small">{resetCreditsSummary(state.credits)}</Text>
                  </div>
                ) : (
                  <ul className="-mx-1 flex max-h-[240px] flex-col gap-1 overflow-y-auto">
                    {rows.map((row) => (
                      <li
                        key={row.key}
                        className="flex items-center gap-2 rounded-lg px-1 py-1"
                      >
                        <Ticket className="size-4 shrink-0 text-ui-tertiary" />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <Text variant="small" className="truncate tabular-nums">
                            {row.label}
                          </Text>
                          {row.detail ? (
                            <Text variant="mini" color="secondary" className="truncate tabular-nums">
                              {row.detail}
                            </Text>
                          ) : null}
                        </div>
                        <Button
                          variant="accent"
                          size="small"
                          disabled={busy || !row.usable}
                          onClick={() => setConfirming(row)}
                        >
                          {busyKey === row.key ? "Using…" : "Use"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
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
              <Button variant="glass" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button variant="accent" onClick={() => void redeem(confirming)}>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
