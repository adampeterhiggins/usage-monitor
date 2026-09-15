//! Native HTTP fetch for the frontend.
//!
//! Fetching from Rust means the request has no webview Origin. Anthropic
//! treats Origin-bearing calls as CORS and some orgs reject those outright;
//! Glaze avoids this by fetching from Node instead of the renderer.

use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(serde::Serialize)]
pub(crate) struct HttpResponse {
    status: u16,
    headers: HashMap<String, String>,
    /// UTF-8 text, or base64 when `encoding` is `"base64"`.
    body: String,
}

/// One client for the process so connections and TLS sessions are reused.
fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .expect("failed to build HTTP client")
    })
}

/// The frontend may only fetch hosts the providers and theme marketplace
/// actually use. Anything else could turn a frontend compromise into an
/// arbitrary exfiltration channel.
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
    "open-vsx.org",
];

/// Pass `encoding: "base64"` for binary bodies (Open VSX VSIX packages).
pub(crate) async fn request(
    url: &str,
    method: Option<&str>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    encoding: Option<&str>,
) -> Result<HttpResponse, String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("Invalid URL: {e}"))?;
    let allowed = parsed.scheme() == "https"
        && parsed
            .host_str()
            .is_some_and(|host| ALLOWED_HOSTS.contains(&host));
    if !allowed {
        return Err(format!("http_request is restricted to known provider hosts: {url}"));
    }

    let method: reqwest::Method = method
        .unwrap_or("GET")
        .parse()
        .map_err(|e| format!("Invalid HTTP method: {e}"))?;

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
        .map_err(|e| format!("Request failed: {e}"))?;
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
            .map_err(|e| format!("Failed to read response: {e}"))?;
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(bytes)
    } else {
        response
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {e}"))?
    };
    Ok(HttpResponse {
        status,
        headers: response_headers,
        body,
    })
}
