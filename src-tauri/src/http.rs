//! Native HTTP fetch for the frontend.
//!
//! Fetching from Rust means the request has no webview Origin. Anthropic
//! treats Origin-bearing calls as CORS and some orgs reject those outright;
//! Glaze avoids this by fetching from Node instead of the renderer.

use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

/// Without a ceiling a stalled connection hangs the invoke forever — and the
/// frontend's in-flight dedupe would keep returning that dead promise, leaving
/// the account card on "loading" until restart.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(serde::Serialize)]
pub(crate) struct HttpResponse {
    status: u16,
    headers: HashMap<String, String>,
    /// UTF-8 text, or base64 when `encoding` is `"base64"`.
    body: String,
}

/// Why a request produced no response. `Network` means it never reached the
/// server — no connection, a DNS failure, or a timeout — which the frontend
/// shows as "offline" instead of blaming the account.
#[derive(serde::Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "lowercase")]
pub(crate) enum HttpFailure {
    Network(String),
    Request(String),
}

impl HttpFailure {
    fn from_reqwest(context: &str, error: reqwest::Error) -> Self {
        let message = format!("{context}: {error}");
        if error.is_connect() || error.is_timeout() {
            Self::Network(message)
        } else {
            Self::Request(message)
        }
    }
}

/// One client for the process so connections and TLS sessions are reused.
fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .build()
            .expect("failed to build HTTP client")
    })
}

/// The frontend may only fetch hosts the providers, their public status
/// pages, theme marketplace, and usage-history rate table (LiteLLM on GitHub)
/// actually use. Anything else
/// could turn a frontend compromise into an arbitrary exfiltration channel.
const ALLOWED_HOSTS: &[&str] = &[
    "claude.ai",
    "console.anthropic.com",
    "api.anthropic.com",
    "cursor.com",
    "www.cursor.com",
    "api2.cursor.sh",
    "authenticator.cursor.sh",
    "auth.openai.com",
    "chatgpt.com",
    "server.codeium.com",
    "app.devin.ai",
    "cli-chat-proxy.grok.com",
    "opencode.ai",
    "status.claude.com",
    "status.openai.com",
    "status.cursor.com",
    "www.devinstatus.com",
    "open-vsx.org",
    "raw.githubusercontent.com",
];

/// GitHub raw content serves every public repo; only LiteLLM's is needed.
const LITELLM_PATH_PREFIX: &str = "/BerriAI/litellm/";

/// Pass `encoding: "base64"` for binary bodies (Open VSX VSIX packages).
pub(crate) async fn request(
    url: &str,
    method: Option<&str>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    encoding: Option<&str>,
) -> Result<HttpResponse, HttpFailure> {
    let parsed =
        reqwest::Url::parse(url).map_err(|e| HttpFailure::Request(format!("Invalid URL: {e}")))?;
    let allowed = parsed.scheme() == "https"
        && parsed.host_str().is_some_and(|host| {
            ALLOWED_HOSTS.contains(&host)
                && (host != "raw.githubusercontent.com"
                    || parsed.path().starts_with(LITELLM_PATH_PREFIX))
        });
    if !allowed {
        return Err(HttpFailure::Request(format!(
            "http_request is restricted to known provider hosts: {url}"
        )));
    }

    let method: reqwest::Method = method
        .unwrap_or("GET")
        .parse()
        .map_err(|e| HttpFailure::Request(format!("Invalid HTTP method: {e}")))?;

    let mut request = client().request(method, parsed);
    if let Some(headers) = headers {
        for (key, value) in headers {
            request = request.header(key, value);
        }
    }
    if let Some(body) = body {
        request = request.body(body);
    }

    let response = request
        .send()
        .await
        .map_err(|e| HttpFailure::from_reqwest("Request failed", e))?;
    let status = response.status().as_u16();
    let mut response_headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(value) = value.to_str() {
            response_headers.insert(key.as_str().to_string(), value.to_string());
        }
    }
    let body = if encoding == Some("base64") {
        let bytes = response
            .bytes()
            .await
            .map_err(|e| HttpFailure::from_reqwest("Failed to read response", e))?;
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(bytes)
    } else {
        response
            .text()
            .await
            .map_err(|e| HttpFailure::from_reqwest("Failed to read response", e))?
    };
    Ok(HttpResponse {
        status,
        headers: response_headers,
        body,
    })
}
