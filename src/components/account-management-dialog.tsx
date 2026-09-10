import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { removeAccount, reorderAccounts, setAccountHidden } from "../lib/accounts";
import { toast } from "../lib/platform/toast";
import { PROVIDERS, type AccountPublic } from "../lib/usage/types";
import { Badge, Button, cn, Text } from "./ui";

interface AccountManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: AccountPublic[];
  onAddAccount: () => void;
  onEditAccount: (account: AccountPublic) => void;
  onAccountsChanged: () => void;
}

function SortableAccountRow({
  account,
  busy,
  onToggleHidden,
  onEdit,
  onRemove,
}: {
  account: AccountPublic;
  busy: boolean;
  onToggleHidden: (account: AccountPublic) => void;
  onEdit: (account: AccountPublic) => void;
  onRemove: (account: AccountPublic) => void;
}) {
  const meta = PROVIDERS[account.provider];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: account.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "flex touch-none items-center gap-1 rounded-xl border border-separator/70 bg-surface px-1.5 py-1.5",
        isDragging ? "z-10 cursor-grabbing shadow-md" : "cursor-grab",
        account.hidden && !isDragging && "opacity-70",
      )}
      {...attributes}
      {...listeners}
    >
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-tertiary" aria-hidden>
        <GripVertical className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge color={meta.accent} size="small">
            {meta.name}
          </Badge>
          <span className={cn("truncate text-[13px]", account.hidden ? "text-tertiary" : "text-ink")}>
            {account.label}
          </span>
        </div>
        {account.hidden ? (
          <div className="mt-0.5 text-[11px] text-quaternary">Hidden from layouts</div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center" onPointerDown={(event) => event.stopPropagation()}>
        <Button
          iconOnly
          variant="transparent"
          size="small"
          aria-label={account.hidden ? "Show account" : "Hide account"}
          disabled={busy}
          onClick={() => onToggleHidden(account)}
        >
          {account.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </Button>
        <Button
          iconOnly
          variant="transparent"
          size="small"
          aria-label="Edit account"
          onClick={() => onEdit(account)}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          iconOnly
          variant="transparent"
          size="small"
          aria-label="Remove account"
          className="text-support-red hover:text-support-red"
          onClick={() => onRemove(account)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

export function AccountManagementDialog({
  open,
  onOpenChange,
  accounts,
  onAddAccount,
  onEditAccount,
  onAccountsChanged,
}: AccountManagementDialogProps) {
  const [ordered, setOrdered] = React.useState<AccountPublic[]>([]);
  const [removeCandidate, setRemoveCandidate] = React.useState<AccountPublic | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  React.useEffect(() => {
    if (!open) {
      setRemoveCandidate(null);
      setBusyId(null);
      return;
    }
    setOrdered(accounts);
  }, [open, accounts]);

  async function persistOrder(next: AccountPublic[]) {
    const previous = ordered;
    setOrdered(next);
    try {
      await reorderAccounts(next.map((a) => a.id));
      onAccountsChanged();
    } catch (error) {
      setOrdered(previous);
      toast.error("Couldn’t reorder accounts", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = ordered.findIndex((a) => a.id === active.id);
    const toIndex = ordered.findIndex((a) => a.id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    void persistOrder(arrayMove(ordered, fromIndex, toIndex));
  }

  async function handleToggleHidden(account: AccountPublic) {
    setBusyId(account.id);
    try {
      await setAccountHidden(account.id, !account.hidden);
      onAccountsChanged();
    } catch (error) {
      toast.error("Couldn’t update account visibility", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmRemove() {
    if (!removeCandidate) return;
    const meta = PROVIDERS[removeCandidate.provider];
    setBusyId(removeCandidate.id);
    try {
      await removeAccount(removeCandidate.id);
      toast.success("Account removed", { description: `${meta.name} · ${removeCandidate.label}` });
      onAccountsChanged();
      setRemoveCandidate(null);
    } catch (error) {
      toast.error("Couldn’t remove account", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusyId(null);
    }
  }

  const orderedIds = ordered.map((a) => a.id);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && removeCandidate) return;
        onOpenChange(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 rounded-[16px] bg-black/25" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[min(440px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-menu p-5 shadow-xl ring-1 ring-black/10">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-[16px] font-semibold">Manage Accounts</Dialog.Title>
              <Dialog.Description className="mt-1 text-[12px] text-secondary">
                Add, edit, hide, remove, or drag to reorder. Order applies to Wall and Ledger layouts.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button iconOnly variant="transparent" size="small" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            {ordered.length === 0 ? (
              <div className="rounded-xl bg-control-subtle px-3 py-8 text-center">
                <Text color="secondary">No accounts yet. Add one to get started.</Text>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
                  <ul className="flex flex-col gap-1.5">
                    {ordered.map((account) => (
                      <SortableAccountRow
                        key={account.id}
                        account={account}
                        busy={busyId === account.id}
                        onToggleHidden={(a) => void handleToggleHidden(a)}
                        onEdit={onEditAccount}
                        onRemove={setRemoveCandidate}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
          </div>

          <div className="mt-4 flex shrink-0 items-center justify-between gap-2">
            <Button variant="accent" size="small" onClick={onAddAccount}>
              <Plus className="size-3.5" />
              Add Account
            </Button>
            <Dialog.Close asChild>
              <Button variant="glass">Done</Button>
            </Dialog.Close>
          </div>

          <Dialog.Root
            open={removeCandidate !== null}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) setRemoveCandidate(null);
            }}
          >
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-[80] rounded-[16px] bg-black/20" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-[90] w-[min(384px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-menu p-4 shadow-xl ring-1 ring-black/10">
                {removeCandidate ? (
                  <>
                    <Dialog.Title className="text-[15px] font-semibold">
                      Remove {removeCandidate.label}?
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-[12px] text-secondary">
                      {PROVIDERS[removeCandidate.provider].name} · {removeCandidate.label} will be removed
                      from this monitor. Your provider login is unaffected.
                    </Dialog.Description>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button variant="glass" onClick={() => setRemoveCandidate(null)}>
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={busyId === removeCandidate.id}
                        onClick={() => void handleConfirmRemove()}
                      >
                        Remove
                      </Button>
                    </div>
                  </>
                ) : null}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
