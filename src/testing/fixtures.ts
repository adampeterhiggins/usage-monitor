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
const inHoursMs = (hours: number) => Date.now() + hours * 3_600_000;

/** The Devin CLI's credentials file — plain TOML, not a Keychain entry. */
const DEVIN_CREDENTIALS_TOML = [
  'windsurf_api_key = "mock-devin-session-token"',
  'api_server_url = "https://server.codeium.com"',
  'devin_webapp_host = "app.devin.ai"',
  'devin_api_url = "https://api.devin.ai"',
].join("\n");

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
    wallColumns: 2,
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
  ".local/share/devin/credentials.toml": DEVIN_CREDENTIALS_TOML,
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
/** Recent Cursor dashboard usage events: a few requests a day for 30 days. */
const MOCK_CURSOR_EVENTS = Array.from({ length: 120 }, (_, index) => {
  const timestamp = Date.now() - index * 6 * 60 * 60 * 1000 - 17 * 60 * 1000;
  const model = index % 3 === 0 ? "claude-opus-4-5-high" : "gpt-5-codex-high-fast";
  const scale = 1 + (index % 5);
  return {
    timestamp: String(timestamp),
    model,
    conversationId: `mock-conversation-${Math.floor(index / 4)}`,
    tokenUsage: {
      inputTokens: 1_200 * scale,
      outputTokens: 900 * scale,
      cacheReadTokens: 42_000 * scale,
      cacheWriteTokens: 600 * scale,
      totalCents: 3.5 * scale,
    },
  };
});

export const MOCK_HTTP_ROUTES: Array<[string, MockHttpResponse]> = [
  [
    "status.claude.com/api/v2/status.json",
    {
      status: 200,
      body: { status: { indicator: "minor", description: "Partially Degraded Service" } },
    },
  ],
  [
    "/api/v2/status.json",
    { status: 200, body: { status: { indicator: "none", description: "All Systems Operational" } } },
  ],
  [
    "SeatManagementService/GetUserStatus",
    {
      status: 200,
      body: {
        userStatus: {
          email: "dev@example.com",
          planStatus: {
            planInfo: { planName: "Teams" },
            // Deliberately omits weeklyQuotaRemainingPercent: proto3 drops
            // zero values, and that must read as 100% used.
            dailyQuotaRemainingPercent: 41,
            dailyQuotaResetAtUnix: String(Math.floor(inHoursMs(9) / 1000)),
            weeklyQuotaResetAtUnix: String(Math.floor(inHoursMs(130) / 1000)),
            overageBalanceMicros: "20615663",
          },
        },
      },
    },
  ],
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
        cedar_ember: {
          eligible: true,
          next_grant_id: "mock_grant",
          grants: [
            { id: "mock_grant", resets_left: 1, usable_now: true, ends_at: inHours(24 * 20) },
          ],
        },
      },
    },
  ],
  [
    "api.anthropic.com/api/oauth/profile",
    {
      status: 200,
      body: {
        email: "dev@example.com",
        account: { email: "dev@example.com" },
        organization: { uuid: "mock-org" },
      },
    },
  ],
  ["/reset_rate_limits", { status: 200, body: { result: "reset" } }],
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
    "chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume",
    { status: 200, body: { code: "reset", windows_reset: 2 } },
  ],
  [
    "chatgpt.com/backend-api/wham/rate-limit-reset-credits",
    {
      status: 200,
      body: {
        available_count: 1,
        credits: [
          {
            id: "mock-credit",
            reset_type: "codex_rate_limits",
            status: "available",
            granted_at: inHours(-24),
            expires_at: inHours(24 * 24),
          },
        ],
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
  ["open-vsx.org/api/-/search", { status: 200, body: { extensions: [], totalSize: 0 } }],
  ["open-vsx.org/api/", { status: 404, body: { error: "not stubbed" } }],
  [
    "api/dashboard/get-filtered-usage-events",
    {
      status: 200,
      body: {
        totalUsageEventsCount: MOCK_CURSOR_EVENTS.length,
        usageEventsDisplay: MOCK_CURSOR_EVENTS,
      },
    },
  ],
  [
    "BerriAI/litellm/main/model_prices_and_context_window.json",
    {
      status: 200,
      body: {
        "claude-opus-4-5": {
          input_cost_per_token: 5e-6,
          output_cost_per_token: 25e-6,
          cache_read_input_token_cost: 0.5e-6,
          cache_creation_input_token_cost: 6.25e-6,
        },
        "claude-sonnet-4-5": {
          input_cost_per_token: 3e-6,
          output_cost_per_token: 15e-6,
          cache_read_input_token_cost: 0.3e-6,
          cache_creation_input_token_cost: 3.75e-6,
        },
        "gpt-5-codex": {
          input_cost_per_token: 1.25e-6,
          output_cost_per_token: 10e-6,
          cache_read_input_token_cost: 0.125e-6,
        },
      },
    },
  ],
];

/** Models the mock usage-history scan emits; `gpt-next-preview` is
 *  deliberately absent from the mock rate tables so "Unpriced" renders. */
const MOCK_HISTORY_MODELS = [
  { provider: "claude", model: "claude-opus-4-5", scale: 1 },
  { provider: "claude", model: "claude-sonnet-4-5", scale: 0.35 },
  { provider: "codex", model: "gpt-5-codex", scale: 0.6 },
  { provider: "codex", model: "gpt-next-preview", scale: 0.05 },
  { provider: "devin", model: "swe-1-7", scale: 0.5 },
] as const;

/** `devin models list --format json`, trimmed to what pricing reads. */
export const MOCK_DEVIN_MODEL_CATALOG = JSON.stringify({
  families: [
    {
      family_label: "SWE-1.7",
      slug: "swe-1-7",
      variants: [
        {
          model_uid: "swe-1-7",
          cost_summary: "$0.5 / 1M Input · $0.2 / 1M Cached input · $2.5 / 1M Output",
        },
      ],
    },
  ],
});

/** Deterministic buckets for whatever periods the dialog asks for. */
export function mockUsageHistoryScan(boundaries: number[]) {
  const buckets = [];
  for (let period = 0; period < boundaries.length - 1; period += 1) {
    // A weekly rhythm with quiet weekends and a gentle upward trend.
    const day = new Date(boundaries[period]).getDay();
    const weekday = day === 0 || day === 6 ? 0.25 : 1;
    const wave = 0.6 + 0.4 * Math.sin(period * 1.3);
    for (const [index, entry] of MOCK_HISTORY_MODELS.entries()) {
      const intensity = weekday * wave * entry.scale * (1 + period / boundaries.length);
      if (intensity < 0.05 || (period + index) % 7 === 3) continue;
      const base = Math.round(intensity * 2_000_000);
      buckets.push({
        period,
        provider: entry.provider,
        model: entry.model,
        fast: false,
        costReported: false,
        reportedCostUsd: 0,
        totals: {
          uncachedInputTokens: Math.round(base * 0.04),
          cachedInputTokens: Math.round(base * 0.9),
          cacheCreationTokens: entry.provider === "claude" ? Math.round(base * 0.03) : 0,
          outputTokens: Math.round(base * 0.03),
          reasoningTokens: entry.provider === "codex" ? Math.round(base * 0.01) : 0,
        },
        records: Math.max(1, Math.round(intensity * 120)),
      });
    }
  }
  return {
    buckets,
    sources: [
      {
        provider: "claude",
        path: "~/.claude/projects",
        status: "ok",
        scannedFiles: 42,
        skippedFiles: 1,
        distinctSessions: 37,
      },
      {
        provider: "codex",
        path: "~/.codex/sessions",
        status: "ok",
        scannedFiles: 18,
        skippedFiles: 0,
        distinctSessions: 16,
      },
      {
        provider: "devin",
        path: "~/.local/share/devin/cli/sessions.db",
        status: "ok",
        scannedFiles: 1,
        skippedFiles: 0,
        distinctSessions: 9,
      },
    ],
    readAtMs: Date.now(),
    scanDurationMs: 12,
  };
}
