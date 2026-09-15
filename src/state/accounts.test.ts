import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccountPublic } from "../contracts/accounts";

vi.mock("../lib/accounts/operations", () => ({
  addAccount: vi.fn(),
  updateAccount: vi.fn(),
  removeAccount: vi.fn(),
  reorderAccounts: vi.fn(),
  setAccountHidden: vi.fn(),
}));
vi.mock("../lib/accounts/repository", () => ({
  listAccounts: vi.fn(),
}));

const usage = vi.hoisted(() => ({ load: vi.fn(), forget: vi.fn(), reset: vi.fn() }));
vi.mock("./usage", () => ({
  useUsageStore: { getState: () => usage },
}));

import { addAccount, removeAccount, updateAccount } from "../lib/accounts/operations";
import { listAccounts } from "../lib/accounts/repository";
import { useAccountsStore } from "./accounts";

const mockedAdd = vi.mocked(addAccount);
const mockedUpdate = vi.mocked(updateAccount);
const mockedRemove = vi.mocked(removeAccount);
const mockedList = vi.mocked(listAccounts);

function publicAccount(id: string): AccountPublic {
  return {
    id,
    provider: "claude",
    label: id,
    authKind: "local-auto",
    hasCredential: false,
    hidden: false,
  };
}

describe("accounts store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAccountsStore.setState({ loaded: false, accounts: [] });
  });

  it("add loads only the new account — other cards keep their state", async () => {
    mockedAdd.mockResolvedValue(publicAccount("new"));
    mockedList.mockResolvedValue([publicAccount("old"), publicAccount("new")]);

    await useAccountsStore
      .getState()
      .add({ provider: "claude", label: "new", auth: { kind: "local-auto" } });

    expect(usage.reset).not.toHaveBeenCalled();
    expect(usage.load).toHaveBeenCalledTimes(1);
    expect(usage.load).toHaveBeenCalledWith("new");
  });

  it("update re-fetches only the edited account", async () => {
    mockedUpdate.mockResolvedValue(publicAccount("a"));
    mockedList.mockResolvedValue([publicAccount("a"), publicAccount("b")]);

    await useAccountsStore.getState().update({
      id: "a",
      provider: "claude",
      label: "renamed",
      auth: { kind: "local-auto" },
    });

    expect(usage.reset).not.toHaveBeenCalled();
    expect(usage.load).toHaveBeenCalledTimes(1);
    expect(usage.load).toHaveBeenCalledWith("a", true);
  });

  it("remove drops the removed account's state", async () => {
    mockedRemove.mockResolvedValue(undefined);
    mockedList.mockResolvedValue([]);

    await useAccountsStore.getState().remove("gone");

    expect(usage.forget).toHaveBeenCalledWith("gone");
  });
});
