import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { openExternal } from "../../lib/platform/external";
import { CircleHelp } from "lucide-react";
import { mergeDeploymentInfo } from "../../lib/platform/deployment";
import { toast } from "../../lib/platform/toast";
import { currentVersion } from "../../lib/updates/api";
import { Tooltip } from "../ui/tooltip";
import { Button } from "../ui";

async function copyValue(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`Copied ${label}`);
  } catch {
    toast.error(`Couldn't copy ${label}`);
  }
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 px-3 py-1.5">
      <span className="text-[11px] text-tertiary">{label}</span>
      <span className="text-right text-[12px] font-medium leading-[16px] break-all text-ink">{children}</span>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      className="rounded-md px-1 py-0.5 -mx-1 text-ink transition-colors hover:bg-control-subtle"
      onClick={() => void copyValue(value, label)}
    >
      {value}
    </button>
  );
}

export function DeploymentInfoButton() {
  const [open, setOpen] = React.useState(false);
  const [version, setVersion] = React.useState<string | null>(null);

  React.useEffect(() => {
    void currentVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  const info = mergeDeploymentInfo(version);
  const hasGitIdentity = info.branch !== null || info.prNumber !== null || info.commit !== null;

  return (
    <Popover.Root modal={false} open={open} onOpenChange={setOpen}>
      <Tooltip label="Deployment" disabled={open}>
        <span className="inline-flex">
          <Popover.Trigger asChild>
            <Button iconOnly variant="glass" size="large" aria-label="Deployment">
              <CircleHelp className="size-4" />
            </Button>
          </Popover.Trigger>
        </span>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-72 overflow-hidden rounded-2xl bg-menu py-1.5 shadow-lg ring-1 ring-black/10"
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          <div className="px-3 pb-1 pt-1.5 text-[12px] font-semibold">This build</div>
          <MetaRow label="Version">
            {info.version !== null ? <CopyButton value={info.version} label="version" /> : "Unknown"}
          </MetaRow>
          {info.branch !== null ? (
            <MetaRow label="Branch">
              <CopyButton value={info.branch} label="branch" />
            </MetaRow>
          ) : null}
          {info.prNumber !== null && info.prUrl !== null ? (
            <MetaRow label="PR">
              <button
                type="button"
                className="rounded-md px-1 py-0.5 -mx-1 text-support-blue transition-colors hover:bg-control-subtle"
                onClick={() => void openExternal(info.prUrl!).catch((error) => toast.error(`Couldn't open PR: ${error}`))}
              >
                #{info.prNumber}
              </button>
            </MetaRow>
          ) : null}
          {info.commitShort !== null && info.commit !== null ? (
            <MetaRow label="Commit">
              <button
                type="button"
                className="rounded-md px-1 py-0.5 -mx-1 font-mono text-[12px] transition-colors hover:bg-control-subtle"
                onClick={() => {
                  if (info.commitUrl) {
                    void openExternal(info.commitUrl).catch(() => void copyValue(info.commit!, "commit"));
                    return;
                  }
                  void copyValue(info.commit!, "commit");
                }}
              >
                {info.commitShort}
              </button>
            </MetaRow>
          ) : null}
          {!hasGitIdentity ? (
            <p className="px-3 pb-1.5 pt-0.5 text-[11px] leading-relaxed text-quaternary">
              Branch and PR are recorded at build time. Release builds show the version and commit.
            </p>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
