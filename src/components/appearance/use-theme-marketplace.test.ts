import { describe, expect, it, vi } from "vitest";

import type {
  OpenVsxThemeExtension,
  OpenVsxThemeSearchPage,
} from "../../lib/theme/open-vsx/client";
import { OpenVsxSearchFlow } from "./use-theme-marketplace";

function extension(id: string): OpenVsxThemeExtension {
  return {
    id,
    collectionId: `open-vsx:${id}`,
    name: id,
    publisher: "pub",
    description: "",
    downloadCount: 0,
    iconUrl: null,
    sourceUrl: null,
    manifestUrl: "https://open-vsx.org/x/manifest.json",
    sha256Url: "https://open-vsx.org/x/sha256",
    vsixUrl: "https://open-vsx.org/x/pack.vsix",
    version: "1.0.0",
    license: "MIT",
  };
}

function page(
  extensions: OpenVsxThemeExtension[],
  { offset = 0, totalSize = 0, fetched }: Partial<OpenVsxThemeSearchPage> = {},
): OpenVsxThemeSearchPage {
  return { extensions, offset, totalSize, fetched: fetched ?? extensions.length };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("OpenVsxSearchFlow", () => {
  it("replaces results on a fresh search", async () => {
    const flow = new OpenVsxSearchFlow(async () => page([extension("a")], { totalSize: 1 }));
    const signal = flow.beginNewSearch();
    await flow.run("q", { signal });
    expect(flow.state.results?.map((x) => x.id)).toEqual(["a"]);
    expect(flow.state.searching).toBe(false);
    expect(flow.state.hasMore).toBe(false);
  });

  it("discards a response from a superseded search", async () => {
    const first = deferred<OpenVsxThemeSearchPage>();
    const second = deferred<OpenVsxThemeSearchPage>();
    const search = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const flow = new OpenVsxSearchFlow(search);

    const oldSignal = flow.beginNewSearch();
    const oldRun = flow.run("old", { signal: oldSignal });
    const newSignal = flow.beginNewSearch();
    expect(oldSignal.aborted).toBe(true);
    const newRun = flow.run("new", { signal: newSignal });

    first.resolve(page([extension("stale")], { totalSize: 1 }));
    await oldRun;
    expect(flow.state.results).toBeNull();

    second.resolve(page([extension("fresh")], { totalSize: 1 }));
    await newRun;
    expect(flow.state.results?.map((x) => x.id)).toEqual(["fresh"]);
  });

  it("appends load-more pages and dedupes by extension id", async () => {
    const search = vi
      .fn()
      .mockImplementationOnce(async () => page([extension("a")], { totalSize: 4, fetched: 1 }))
      .mockImplementationOnce(async () =>
        page([extension("a"), extension("b")], { offset: 1, totalSize: 4, fetched: 2 }),
      );
    const flow = new OpenVsxSearchFlow(search);

    const signal = flow.beginNewSearch();
    await flow.run("q", { signal });
    await flow.loadMore("q");

    expect(flow.state.results?.map((x) => x.id)).toEqual(["a", "b"]);
    expect(flow.state.hasMore).toBe(true); // offset 3 < totalSize 4
  });

  it("skips empty pages while loading more", async () => {
    const calls: number[] = [];
    const flow = new OpenVsxSearchFlow(async (_q, { offset }) => {
      calls.push(offset ?? 0);
      if ((offset ?? 0) === 0) return page([extension("a")], { totalSize: 40, fetched: 16 });
      if (offset === 16) return page([], { totalSize: 40, fetched: 0 });
      return page([extension("b")], { totalSize: 40, fetched: 16 });
    });

    const signal = flow.beginNewSearch();
    await flow.run("q", { signal });
    await flow.loadMore("q");

    expect(calls).toEqual([0, 16, 32]);
    expect(flow.state.results?.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("reports failures and clears results for a fresh search", async () => {
    const onError = vi.fn();
    const flow = new OpenVsxSearchFlow(async () => {
      throw new Error("offline");
    }, onError);
    const signal = flow.beginNewSearch();
    await flow.run("q", { signal });
    expect(flow.state.results).toEqual([]);
    expect(flow.state.searching).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("keeps prior results when load-more fails", async () => {
    const onError = vi.fn();
    const search = vi
      .fn()
      .mockImplementationOnce(async () => page([extension("a")], { totalSize: 4, fetched: 1 }))
      .mockImplementationOnce(async () => {
        throw new Error("offline");
      });
    const flow = new OpenVsxSearchFlow(search, onError);
    const signal = flow.beginNewSearch();
    await flow.run("q", { signal });
    await flow.loadMore("q");
    expect(flow.state.results?.map((x) => x.id)).toEqual(["a"]);
    expect(flow.state.loadingMore).toBe(false);
  });

  it("swallows aborts without reporting errors", async () => {
    const onError = vi.fn();
    const flow = new OpenVsxSearchFlow(
      (_q, { signal }) =>
        new Promise<OpenVsxThemeSearchPage>((_resolve, reject) => {
          signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
      onError,
    );
    const signal = flow.beginNewSearch();
    const run = flow.run("q", { signal });
    flow.beginNewSearch(); // supersedes → aborts the in-flight request
    await run;
    expect(onError).not.toHaveBeenCalled();
    expect(flow.state.results).toBeNull();
  });
});
