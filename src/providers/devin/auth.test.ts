import { describe, expect, it } from "vitest";
import { devinApiKey, parseDevinCallback, parseDevinCredentialsToml } from "./auth";

const TOML = `windsurf_api_key = "abc123token"
api_server_url = "https://server.codeium.com"
devin_webapp_host = "app.devin.ai"
devin_api_url = "https://api.devin.ai"
`;

describe("parseDevinCredentialsToml", () => {
  it("reads the key out of the CLI's credentials file", () => {
    expect(parseDevinCredentialsToml(TOML, "file")).toBe("abc123token");
  });

  it("explains what to do when the file has no key", () => {
    expect(() => parseDevinCredentialsToml('api_server_url = "x"', "file")).toThrow(
      "devin auth login",
    );
  });
});

describe("devinApiKey", () => {
  it("accepts a bare key or a whole credentials file", () => {
    expect(devinApiKey("abc123token", "T")).toBe("abc123token");
    expect(devinApiKey(TOML, "T")).toBe("abc123token");
  });

  it("rejects empty and obviously wrong input", () => {
    expect(() => devinApiKey("   ", "T")).toThrow("is empty");
    expect(() => devinApiKey("not a key at all", "T")).toThrow("not a Devin API key");
  });
});

describe("parseDevinCallback", () => {
  it("reads code and state from the pasted loopback address", () => {
    expect(parseDevinCallback("http://127.0.0.1:51703/callback?code=abc&state=xyz")).toEqual({
      code: "abc",
      state: "xyz",
    });
  });

  it("accepts a bare code and strips stray quotes", () => {
    expect(parseDevinCallback('  "abc"  ')).toEqual({ code: "abc" });
  });

  it("rejects empty input and a URL with no code", () => {
    expect(() => parseDevinCallback("")).toThrow("Paste the code");
    expect(() => parseDevinCallback("http://127.0.0.1:51703/callback?state=xyz")).toThrow(
      "no `code` parameter",
    );
  });
});
