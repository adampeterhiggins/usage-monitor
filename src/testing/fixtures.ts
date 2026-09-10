/**
 * Canned data for browser-mock mode (`vite --mode mock`). Every secret-shaped
 * value here is a placeholder; the mock must never read the real Keychain,
 * home directory, or network.
 */

function b64url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function mockJwt(payload: Record<string, unknown>): string {
  return `${b64url('{"alg":"none","typ":"JWT"}')}.${b64url(JSON.stringify(payload))}.mock-signature`;
}

const inDays = (days: number) => Math.floor(Date.now() / 1000) + days * 86_400;
const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

export const MOCK_USER_ID = "user_mock_1234";
export const MOCK_CURSOR_SESSION_JWT = mockJwt({
  sub: `auth0|${MOCK_USER_ID}`,
  type: "session",
  exp: inDays(90),
});
export const MOCK_CODEX_ACCESS_TOKEN = mockJwt({
  "https://api.openai.com/auth": { chatgpt_account_id: "acct_mock_codex" },
  exp: inDays(30),
});

const CODEX_AUTH_JSON = JSON.stringify({
  tokens: {
    access_token: MOCK_CODEX_ACCESS_TOKEN,
    refresh_token: "mock-codex-refresh",
    account_id: "acct_mock_codex",
  },
});

const CLAUDE_KEYCHAIN_JSON = JSON.stringify({
  claudeAiOauth: {
    accessToken: "mock-claude-access-token",
    refreshToken: "mock-claude-refresh-token",
    expiresAt: Date.now() + 86_400_000,
  },
});

/** accounts.json — three native-login accounts, one per provider. */
export const MOCK_ACCOUNTS = [
  {
    id: "acct-claude",
    provider: "claude",
    label: "Claude (CLI login)",
    credential: "",
    hidden: false,
  },
  {
    id: "acct-codex",
    provider: "codex",
    label: "Codex (auth.json)",
    credential: "",
    hidden: false,
  },
  {
    id: "acct-cursor",
    provider: "cursor",
    label: "Cursor (app login)",
    credential: "",
    extra: "ide",
    hidden: false,
  },
];

/** Seeds for the plugin-store LazyStore files, keyed by store path. */
export const MOCK_STORES: Record<string, Record<string, unknown>> = {
  "accounts.json": { accounts: MOCK_ACCOUNTS },
  "settings.json": {
    theme: "t3-chat",
    appearanceMode: "system",
    layout: "wall",
  },
};

/** Keychain listings per service (attributes only, like the real command). */
export const MOCK_KEYCHAIN_ACCOUNTS: Record<string, Array<{ account: string; modified?: string }>> = {
  "Claude Code-credentials": [{ account: "claude-code-login", modified: "20260101000000Z" }],
  "Codex Auth": [{ account: "codex-cli", modified: "20260101000000Z" }],
  "cursor-access-token": [{ account: "cursor-agent", modified: "20260101000000Z" }],
};

/** Keychain secret bodies per service. */
export const MOCK_KEYCHAIN_PASSWORDS: Record<string, string> = {
  "Claude Code-credentials": CLAUDE_KEYCHAIN_JSON,
  "Codex Auth": CODEX_AUTH_JSON,
  "cursor-access-token": MOCK_CURSOR_SESSION_JWT,
};

/** `read_home_file` bodies, keyed by the relPath the fetchers ask for. */
export const MOCK_HOME_FILES: Record<string, string> = {
  ".codex/auth.json": CODEX_AUTH_JSON,
  ".cursor/auth.json": MOCK_CURSOR_SESSION_JWT,
};

export interface MockHttpResponse {
  status: number;
  body: unknown;
}

/**
 * `http_request` responses routed by URL substring, first match wins.
 * Anything unlisted gets a 501 so unstubbed endpoints fail loudly instead of
 * silently hitting the real network (which a browser mock cannot do anyway —
 * CORS would block most of these).
 */
export const MOCK_HTTP_ROUTES: Array<[string, MockHttpResponse]> = [
  [
    "claude.ai/api/organizations",
    { status: 200, body: [{ uuid: "mock-org", name: "Mock Org" }] },
  ],
  [
    "api.anthropic.com/api/oauth/usage",
    {
      status: 200,
      body: {
        five_hour: { utilization: 42, resets_at: inHours(3) },
        seven_day: { utilization: 18, resets_at: inHours(96) },
        seven_day_sonnet: { utilization: 30, resets_at: inHours(96) },
        extra_usage: {
          is_enabled: true,
          monthly_limit: 2500,
          used_credits: 1120,
          utilization: 44.8,
          currency: "USD",
        },
      },
    },
  ],
  [
    "api.anthropic.com/api/oauth/profile",
    { status: 200, body: { email: "dev@example.com", account: { email: "dev@example.com" } } },
  ],
  [
    "api.anthropic.com/v1/oauth/token",
    {
      status: 200,
      body: {
        access_token: "mock-claude-refreshed-token",
        refresh_token: "mock-claude-refresh-token",
        expires_in: 86_400,
      },
    },
  ],
  [
    "chatgpt.com/backend-api/wham/usage",
    {
      status: 200,
      body: {
        plan_type: "plus",
        email: "dev@example.com",
        rate_limit: {
          primary_window: {
            used_percent: 35,
            limit_window_seconds: 18_000,
            reset_at: Math.floor(Date.now() / 1000) + 14_400,
          },
          secondary_window: {
            used_percent: 12,
            limit_window_seconds: 604_800,
            reset_at: Math.floor(Date.now() / 1000) + 400_000,
          },
        },
        credits: { balance: "12.40", unlimited: false },
      },
    },
  ],
  [
    "auth.openai.com/oauth/token",
    {
      status: 200,
      body: {
        access_token: MOCK_CODEX_ACCESS_TOKEN,
        refresh_token: "mock-codex-refresh",
        id_token: mockJwt({ email: "dev@example.com" }),
      },
    },
  ],
  [
    "cursor.com/api/usage-summary",
    {
      status: 200,
      body: {
        billingCycleStart: new Date(Date.now() - 10 * 86_400_000).toISOString(),
        billingCycleEnd: new Date(Date.now() + 20 * 86_400_000).toISOString(),
        membershipType: "pro",
        individualUsage: {
          plan: { enabled: true, used: 1240, limit: 5000, totalPercentUsed: 24.8 },
          onDemand: { enabled: false, used: 0, limit: null },
        },
      },
    },
  ],
  [
    "cursor.com/api/dashboard/get-sand-usage-status",
    {
      status: 200,
      body: {
        usagePercent: 8,
        nextResetTimestampUtc: inHours(30),
        hasAvailableUsage: true,
        grokPlanLabel: "Grok",
      },
    },
  ],
  [
    "cursor.com/api/auth/me",
    { status: 200, body: { email: "dev@example.com", name: "Mock Dev" } },
  ],
  [
    "api2.cursor.sh/auth/poll",
    // Completing instantly makes the browser-login flow testable end to end.
    { status: 200, body: { accessToken: MOCK_CURSOR_SESSION_JWT } },
  ],
  [
    "github.com/login/device/code",
    {
      status: 200,
      body: {
        device_code: "mock-device-code",
        user_code: "MOCK-CODE",
        verification_uri: "https://github.com/login/device",
        interval: 1,
        expires_in: 900,
      },
    },
  ],
  [
    "github.com/login/oauth/access_token",
    { status: 200, body: { access_token: "ghp_mock_github_token", token_type: "bearer" } },
  ],
  ["api.github.com/user", { status: 200, body: { login: "mockdev" } }],
  ["open-vsx.org/api/-/search", { status: 200, body: { extensions: [], totalSize: 0 } }],
  ["open-vsx.org/api/", { status: 404, body: { error: "not stubbed" } }],
];
