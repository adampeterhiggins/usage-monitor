//! The IPC boundary: every `#[tauri::command]` the frontend can `invoke()`.
//!
//! These are thin wrappers only — domain logic lives in `panel`,
//! `credentials`, and `http`, which keeps it callable from tray handlers and
//! unit tests without going through the command machinery.

use std::collections::HashMap;

use tauri::AppHandle;

use crate::{credentials, http, panel};

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

/// Read a named cookie from a webview (used by Cursor sign-in).
#[tauri::command]
pub(crate) async fn read_window_cookie(
    app: AppHandle,
    label: String,
    name: String,
    urls: Option<Vec<String>>,
) -> Result<Option<String>, String> {
    credentials::read_window_cookie(&app, &label, &name, urls.as_deref()).await
}

/// Read a file under the user's home directory (Codex auth.json, Claude credentials).
#[tauri::command]
pub(crate) fn read_home_file(rel_path: String) -> Result<String, String> {
    credentials::read_home_file(&rel_path)
}

/// Read a generic password from the macOS Keychain (Claude Code login).
#[tauri::command]
pub(crate) fn read_keychain_password(
    service: String,
    account: Option<String>,
) -> Result<String, String> {
    credentials::keychain::read_password(&service, account.as_deref())
}

/// List Keychain accounts stored under `service`, newest first.
#[tauri::command]
pub(crate) fn list_keychain_accounts(
    service: String,
) -> Result<Vec<credentials::keychain::KeychainEntry>, String> {
    credentials::keychain::list_accounts(&service)
}

/// Cursor IDE login attributes for the account picker. Never returns the token.
#[tauri::command]
pub(crate) fn cursor_ide_login_meta(
) -> Result<Option<credentials::cursor_ide::CursorIdeLogin>, String> {
    credentials::cursor_ide::login_meta()
}

#[tauri::command]
pub(crate) fn read_cursor_ide_access_token() -> Result<String, String> {
    credentials::cursor_ide::access_token()
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
