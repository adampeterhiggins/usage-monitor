//! The IPC boundary: every `#[tauri::command]` the frontend can `invoke()`.
//!
//! These are thin wrappers only — domain logic lives in `panel`,
//! `credentials`, and `http`, which keeps it callable from tray handlers and
//! unit tests without going through the command machinery.

use std::collections::HashMap;

use tauri::AppHandle;

use crate::{credentials, http, oauth, panel};

#[tauri::command]
pub(crate) fn hide_window(app: AppHandle) {
    panel::hide(&app);
}

#[tauri::command]
pub(crate) fn show_window(app: AppHandle) {
    panel::show(&app, None);
}

#[tauri::command]
pub(crate) fn toggle_window(app: AppHandle) {
    panel::toggle(&app, None);
}

#[tauri::command]
pub(crate) fn open_settings_popover(app: AppHandle) {
    panel::open_settings(&app);
}

/// Call before creating/focusing an auxiliary window (Appearance, provider
/// login) so the tray panel's blur-to-hide path does not NSApp.hide() it away.
#[tauri::command]
pub(crate) fn prepare_open_appearance(app: AppHandle) {
    panel::prepare_aux_window(&app);
}

#[tauri::command]
pub(crate) fn appearance_window_closed(app: AppHandle) {
    panel::aux_window_closed(&app);
}

/// While Add Account or Manage Accounts is open, become a normal app (Dock /
/// Cmd-Tab) and do not hide the panel when the browser takes focus.
#[tauri::command]
pub(crate) fn set_account_modal_open(app: AppHandle, open: bool) {
    panel::set_account_modal(&app, open);
}

/// Read a file under the user's home directory (Codex auth.json, Claude credentials).
///
/// These credential commands shell out to `security`/`sqlite3` or hit the
/// filesystem — synchronous commands run on the main thread, so a `security`
/// call sitting on a Keychain authorization prompt would freeze the whole
/// app. `spawn_blocking` keeps them off it and lets concurrent invokes run
/// in parallel.
#[tauri::command]
pub(crate) async fn read_home_file(rel_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || credentials::read_home_file(&rel_path))
        .await
        .map_err(|e| format!("read_home_file stopped unexpectedly: {e}"))?
}

/// Read a generic password from the macOS Keychain (Claude Code login).
#[tauri::command]
pub(crate) async fn read_keychain_password(
    service: String,
    account: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        credentials::keychain::read_password(&service, account.as_deref())
    })
    .await
    .map_err(|e| format!("Keychain read stopped unexpectedly: {e}"))?
}

/// List Keychain accounts stored under `service`, newest first.
#[tauri::command]
pub(crate) async fn list_keychain_accounts(
    service: String,
) -> Result<Vec<credentials::keychain::KeychainEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || credentials::keychain::list_accounts(&service))
        .await
        .map_err(|e| format!("Keychain list stopped unexpectedly: {e}"))?
}

/// Cursor IDE login attributes for the account picker. Never returns the token.
#[tauri::command]
pub(crate) async fn cursor_ide_login_meta(
) -> Result<Option<credentials::cursor_ide::CursorIdeLogin>, String> {
    tauri::async_runtime::spawn_blocking(credentials::cursor_ide::login_meta)
        .await
        .map_err(|e| format!("Cursor IDE lookup stopped unexpectedly: {e}"))?
}

#[tauri::command]
pub(crate) async fn read_cursor_ide_access_token() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(credentials::cursor_ide::access_token)
        .await
        .map_err(|e| format!("Cursor IDE token read stopped unexpectedly: {e}"))?
}

/// Bind a loopback port for a provider sign-in redirect; returns the port.
/// `ports` are tried in order (empty/absent = any free port) for providers
/// whose redirect URIs are allow-listed; `callback_path` is the path the
/// listener waits on (default `/callback`).
#[tauri::command]
pub(crate) fn oauth_listen(
    ports: Option<Vec<u16>>,
    callback_path: Option<String>,
) -> Result<u16, String> {
    let ports = ports.unwrap_or_default();
    let ports = if ports.is_empty() { vec![0] } else { ports };
    oauth::listen(
        &ports,
        &callback_path.unwrap_or_else(|| "/callback".to_string()),
    )
}

/// Wait for the browser to deliver the authorization code to `port`.
#[tauri::command]
pub(crate) async fn oauth_wait(port: u16, timeout_secs: Option<u64>) -> Result<String, String> {
    let secs = timeout_secs.unwrap_or(300);
    tauri::async_runtime::spawn_blocking(move || oauth::wait(port, secs))
        .await
        .map_err(|e| format!("Sign-in listener stopped unexpectedly: {e}"))?
}

/// Release a bound sign-in port when the user cancels.
#[tauri::command]
pub(crate) fn oauth_cancel(port: u16) {
    oauth::cancel(port);
}

/// Fetch via the Rust side so requests carry no webview Origin.
/// Pass `encoding: "base64"` for binary bodies.
#[tauri::command]
pub(crate) async fn http_request(
    url: String,
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    encoding: Option<String>,
) -> Result<http::HttpResponse, String> {
    http::request(&url, method.as_deref(), headers, body, encoding.as_deref()).await
}
