//! Provider credential access: webview cookies, files under `$HOME`, and
//! platform stores (macOS Keychain, the Cursor IDE database).

pub(crate) mod cursor_ide;
pub(crate) mod keychain;

use tauri::{AppHandle, Manager};

fn dirs_home() -> Option<String> {
    std::env::var("HOME").ok()
}

/// Read a file under the user's home directory (Codex auth.json, Claude credentials).
pub(crate) fn read_home_file(rel_path: &str) -> Result<String, String> {
    let home = dirs_home().ok_or_else(|| "Could not resolve the home directory.".to_string())?;
    let path = std::path::Path::new(&home).join(rel_path);
    std::fs::read_to_string(&path).map_err(|e| format!("Could not read {}: {e}", path.display()))
}

/// Read a named cookie from a webview (used by Cursor sign-in).
pub(crate) async fn read_window_cookie(
    app: &AppHandle,
    label: &str,
    name: &str,
    urls: Option<&[String]>,
) -> Result<Option<String>, String> {
    let win = app
        .get_webview_window(label)
        .ok_or_else(|| "Login window not found.".to_string())?;
    let mut cookies = Vec::new();
    if let Some(urls) = urls {
        for raw in urls {
            let url = raw
                .parse::<tauri::Url>()
                .map_err(|e| format!("Invalid cookie URL {raw}: {e}"))?;
            if let Ok(found) = win.cookies_for_url(url) {
                cookies.extend(found);
            }
        }
    }
    if cookies.is_empty() {
        cookies = win
            .cookies()
            .map_err(|e| format!("Could not read cookies: {e}"))?;
    }
    Ok(cookies
        .into_iter()
        .find(|cookie| cookie.name() == name && !cookie.value().is_empty())
        .map(|cookie| cookie.value().to_string()))
}
