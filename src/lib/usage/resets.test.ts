import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Account } from "../../contracts/accounts";
import { ResetCreditError } from "../../contracts/resets";

vi.mock("../../providers/registry", () => ({
  consumeProviderResetCredit: vi.fn(),
  fetchProviderResetCredits: vi.fn(),
}));
vi.mock("../accounts/repository", () => ({ getAccount: vi.fn() }));
vi.mock("../accounts/operations", () => ({ replaceAccountCredential: vi.fn() }));
vi.mock("./policy", () => ({ invalidate: vi.fn() }));

import { consumeProviderResetCredit } from "../../providers/registry";
import { getAccount } from "../accounts/repository";
import { invalidate } from "./policy";
import { redeemResetCredit } from "./resets";

const mockedConsume = vi.mocked(consumeProviderResetCredit);

function account(id: string): Account {
  return { id, provider: "codex", label: id, auth: { kind: "local-auto" }, hidden: false };
}

const credits = { availableCount: 1, nextCreditId: "grant_1" };

function requestIds(): string[] {
  return mockedConsume.mock.calls.map(([, input]) => input.requestId);
}

beforeEach(() => {
  mockedConsume.mockReset();
  vi.mocked(invalidate).mockReset();
  vi.mocked(getAccount).mockImplementation(async (id) => account(id));
});

describe("redeemResetCredit", () => {
  it("passes the credit id and invalidates cached usage after a reset", async () => {
    mockedConsume.mockResolvedValueOnce("reset");
    await expect(redeemResetCredit("a", credits)).resolves.toBe("reset");
    expect(mockedConsume.mock.calls[0][1].creditId).toBe("grant_1");
    expect(invalidate).toHaveBeenCalledWith("a");
  });

  it("reuses the request id after an unsettled failure", async () => {
    mockedConsume
      .mockRejectedValueOnce(new ResetCreditError("timed out", false))
      .mockResolvedValueOnce("reset")
      .mockResolvedValueOnce("nothingToReset");
    await expect(redeemResetCredit("b", credits)).rejects.toThrow("timed out");
    await redeemResetCredit("b", credits);
    await redeemResetCredit("b", credits);
    const [first, retry, next] = requestIds();
    expect(retry).toBe(first);
    expect(next).not.toBe(first);
  });

  it("starts a new attempt after a settled failure", async () => {
    mockedConsume
      .mockRejectedValueOnce(new ResetCreditError("cooling down", true))
      .mockResolvedValueOnce("reset");
    await expect(redeemResetCredit("c", credits)).rejects.toThrow("cooling down");
    await redeemResetCredit("c", credits);
    const [first, second] = requestIds();
    expect(second).not.toBe(first);
  });

  it("queues overlapping redeems for one account", async () => {
    let release!: () => void;
    mockedConsume.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve("reset"))),
    );
    mockedConsume.mockResolvedValueOnce("nothingToReset");
    const first = redeemResetCredit("d", credits);
    const second = redeemResetCredit("d", credits);
    await vi.waitFor(() => expect(mockedConsume).toHaveBeenCalledTimes(1));
    release();
    await expect(first).resolves.toBe("reset");
    await expect(second).resolves.toBe("nothingToReset");
    expect(mockedConsume).toHaveBeenCalledTimes(2);
  });
});
