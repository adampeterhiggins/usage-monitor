use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, Rect, WebviewWindow,
};

#[cfg(target_os = "macos")]
use objc2_app_kit::NSApplication;
#[cfg(target_os = "macos")]
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt,
};

#[cfg(target_os = "macos")]
tauri_panel! {
    panel!(MainPanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: false,
            is_floating_panel: true,
            becomes_key_only_if_needed: false,
            hides_on_deactivate: false
        }
    })
}

const WINDOW_SHOWN_EVENT: &str = "window:shown";
const OPEN_SETTINGS_EVENT: &str = "settings:openPopover";

#[derive(Clone, Copy, serde::Serialize, serde::Deserialize)]
struct WindowFrame {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

struct PanelState {
    ignore_next_blur: AtomicBool,
    /// When true, hide the tray panel without calling NSApp.hide — used while the
    /// Appearance window is open so it isn't swept away with the panel.
    keep_app_active: AtomicBool,
    last_tray_rect: Mutex<Option<Rect>>,
    saved_frame: Mutex<Option<WindowFrame>>,
}

impl Default for PanelState {
    fn default() -> Self {
        Self {
            ignore_next_blur: AtomicBool::new(false),
            keep_app_active: AtomicBool::new(false),
            last_tray_rect: Mutex::new(None),
            saved_frame: Mutex::new(None),
        }
    }
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

fn position_under_tray(win: &WebviewWindow, tray: Rect) {
    let Ok(size) = win.outer_size() else { return };
    let scale = win.scale_factor().unwrap_or(1.0);
    let pos = tray.position.to_physical::<i32>(scale);
    let tray_size = tray.size.to_physical::<u32>(scale);
    let x = pos.x + tray_size.width as i32 / 2 - size.width as i32 / 2;
    let y = pos.y + tray_size.height as i32 + 4;
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

fn center_on_cursor_screen(win: &WebviewWindow) {
    let Ok(cursor) = win.cursor_position() else {
        let _ = win.center();
        return;
    };
    let Ok(Some(monitor)) = win.available_monitors().map(|monitors| {
        monitors.into_iter().find(|m| {
            let pos = m.position();
            let size = m.size();
            let x = cursor.x as i32;
            let y = cursor.y as i32;
            x >= pos.x && x < pos.x + size.width as i32 && y >= pos.y && y < pos.y + size.height as i32
        })
    }) else {
        let _ = win.center();
        return;
    };

    let Ok(size) = win.outer_size() else { return };
    let work = monitor.work_area();
    let x = work.position.x + (work.size.width as i32 - size.width as i32) / 2;
    let y = work.position.y + (work.size.height as i32 - size.height as i32) / 2;
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

fn frame_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join("window-frame.json"))
}

fn load_saved_frame(app: &AppHandle) -> Option<WindowFrame> {
    let data = std::fs::read_to_string(frame_path(app)?).ok()?;
    serde_json::from_str(&data).ok()
}

fn persist_frame(app: &AppHandle, frame: WindowFrame) {
    let Some(path) = frame_path(app) else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string(&frame) {
        let _ = std::fs::write(path, json);
    }
}

fn current_frame(win: &WebviewWindow) -> Option<WindowFrame> {
    let pos = win.outer_position().ok()?;
    let size = win.outer_size().ok()?;
    let scale = win.scale_factor().unwrap_or(1.0);
    Some(WindowFrame {
        x: (pos.x as f64 / scale).round() as i32,
        y: (pos.y as f64 / scale).round() as i32,
        width: (size.width as f64 / scale).round() as u32,
        height: (size.height as f64 / scale).round() as u32,
    })
}

fn apply_frame(win: &WebviewWindow, frame: WindowFrame) {
    let _ = win.set_size(LogicalSize::new(frame.width, frame.height));
    let _ = win.set_position(LogicalPosition::new(frame.x, frame.y));
}

fn frame_is_on_screen(win: &WebviewWindow, frame: WindowFrame) -> bool {
    let Ok(monitors) = win.available_monitors() else {
        return true;
    };
    let scale = win.scale_factor().unwrap_or(1.0);
    let x = (frame.x as f64 * scale) as i32;
    let y = (frame.y as f64 * scale) as i32;
    let w = (frame.width as f64 * scale) as i32;
    let h = (frame.height as f64 * scale) as i32;
    monitors.iter().any(|monitor| {
        let pos = monitor.position();
        let size = monitor.size();
        let left = x.max(pos.x);
        let top = y.max(pos.y);
        let right = (x + w).min(pos.x + size.width as i32);
        let bottom = (y + h).min(pos.y + size.height as i32);
        right - left > 40 && bottom - top > 40
    })
}

fn remember_frame(app: &AppHandle) {
    let Some(win) = main_window(app) else { return };
    let Some(frame) = current_frame(&win) else { return };
    if let Ok(mut saved) = app.state::<PanelState>().saved_frame.lock() {
        *saved = Some(frame);
    }
    persist_frame(app, frame);
}

fn place_panel(app: &AppHandle, win: &WebviewWindow, tray_bounds: Option<Rect>) {
    let state = app.state::<PanelState>();
    if let Some(bounds) = tray_bounds {
        if let Ok(mut last) = state.last_tray_rect.lock() {
            *last = Some(bounds);
        }
    }

    let saved = state.saved_frame.lock().ok().and_then(|frame| *frame);
    if let Some(frame) = saved {
        if frame_is_on_screen(win, frame) {
            apply_frame(win, frame);
            return;
        }
    }

    if let Some(bounds) = tray_bounds {
        position_under_tray(win, bounds);
    } else if let Ok(last) = state.last_tray_rect.lock() {
        if let Some(bounds) = *last {
            position_under_tray(win, bounds);
        } else {
            center_on_cursor_screen(win);
        }
    } else {
        center_on_cursor_screen(win);
    }
}

fn panel_visible(app: &AppHandle) -> bool {
    #[cfg(target_os = "macos")]
    {
        return app
            .get_webview_panel("main")
            .map(|panel| panel.is_visible())
            .unwrap_or(false);
    }

    #[cfg(not(target_os = "macos"))]
    {
        main_window(app)
            .and_then(|win| win.is_visible().ok())
            .unwrap_or(false)
    }
}

#[cfg(target_os = "macos")]
fn resign_app_activation() {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let ns_app = NSApplication::sharedApplication(mtm);
    if ns_app.isActive() {
        ns_app.hide(None);
    }
}

#[cfg(target_os = "macos")]
fn first_responder_view(
    view: &tauri_nspanel::NSView,
) -> Option<tauri_nspanel::objc2::rc::Retained<tauri_nspanel::NSView>> {
    for subview in view.subviews().to_vec() {
        if subview.acceptsFirstResponder() {
            return Some(subview);
        }
        if let Some(found) = first_responder_view(&subview) {
            return Some(found);
        }
    }
    None
}

fn show_panel(app: &AppHandle, tray_bounds: Option<Rect>) {
    let Some(win) = main_window(app) else { return };
    let state = app.state::<PanelState>();

    place_panel(app, &win, tray_bounds);

    state.ignore_next_blur.store(true, Ordering::SeqCst);

    #[cfg(target_os = "macos")]
    {
        if let Ok(panel) = app.get_webview_panel("main") {
            let was_visible = panel.is_visible();
            panel.show();
            panel.make_key_window();

            if let Ok(ns_view) = win.ns_view() {
                let view = ns_view as *const tauri_nspanel::NSView;
                if !view.is_null() {
                    let content = unsafe { &*view };
                    // The window's content view never accepts first responder status, so
                    // handing it the focus leaves key events stranded at the panel and the
                    // web content only starts seeing them after a click. Target the webview.
                    let webview = first_responder_view(content);
                    let responder = webview.as_deref().unwrap_or(content);
                    let _ = panel.make_first_responder(Some(responder.as_ref()));
                }
            }

            if !was_visible {
                let _ = win.emit(WINDOW_SHOWN_EVENT, ());
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let was_visible = win.is_visible().unwrap_or(false);
        let _ = win.show();
        let _ = win.set_focus();

        if !was_visible {
            let _ = win.emit(WINDOW_SHOWN_EVENT, ());
        }
    }

    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(250));
        let state = handle.state::<PanelState>();
        if !state.keep_app_active.load(Ordering::SeqCst) {
            state.ignore_next_blur.store(false, Ordering::SeqCst);
        }
    });
}

fn appearance_window_visible(app: &AppHandle) -> bool {
    app.get_webview_window("appearance")
        .and_then(|win| win.is_visible().ok())
        .unwrap_or(false)
}

fn hide_panel(app: &AppHandle) {
    remember_frame(app);

    #[cfg(target_os = "macos")]
    {
        if let Ok(panel) = app.get_webview_panel("main") {
            if panel.is_visible() {
                panel.resign_key_window();
                panel.hide();
            }
        }
        // Never NSApp.hide while Appearance (or another settings window) needs to stay up —
        // that call hides every window in the accessory app, not just the tray panel.
        let keep_active = app
            .state::<PanelState>()
            .keep_app_active
            .load(Ordering::SeqCst)
            || appearance_window_visible(app);
        if !keep_active {
            resign_app_activation();
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        if let Some(win) = main_window(app) {
            let _ = win.hide();
        }
    }
}

fn toggle_panel(app: &AppHandle, tray_bounds: Option<Rect>) {
    if panel_visible(app) {
        hide_panel(app);
    } else {
        show_panel(app, tray_bounds);
    }
}

fn open_settings(app: &AppHandle) {
    show_panel(app, None);
    if let Some(win) = main_window(app) {
        let _ = win.emit(OPEN_SETTINGS_EVENT, ());
    }
}

#[tauri::command]
fn hide_window(app: AppHandle) {
    hide_panel(&app);
}

#[tauri::command]
fn show_window(app: AppHandle) {
    show_panel(&app, None);
}

#[tauri::command]
fn toggle_window(app: AppHandle) {
    toggle_panel(&app, None);
}

#[tauri::command]
fn open_settings_popover(app: AppHandle) {
    open_settings(&app);
}

/// Call before creating/focusing the Appearance window so the tray panel's
/// blur-to-hide path does not NSApp.hide() the new window away.
#[tauri::command]
fn prepare_open_appearance(app: AppHandle) {
    let state = app.state::<PanelState>();
    state.ignore_next_blur.store(true, Ordering::SeqCst);
    state.keep_app_active.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn appearance_window_closed(app: AppHandle) {
    let state = app.state::<PanelState>();
    state.keep_app_active.store(false, Ordering::SeqCst);
    state.ignore_next_blur.store(false, Ordering::SeqCst);
}

/// Read a file under the user's home directory (Codex auth.json, Claude credentials).
#[tauri::command]
fn read_home_file(rel_path: String) -> Result<String, String> {
    let home = dirs_home().ok_or_else(|| "Could not resolve the home directory.".to_string())?;
    let path = std::path::Path::new(&home).join(rel_path);
    std::fs::read_to_string(&path).map_err(|e| format!("Could not read {}: {e}", path.display()))
}

/// Read a generic password from the macOS Keychain (Claude Code login).
///
/// When `account` is given the lookup is pinned to that Keychain account
/// (`security -a`); otherwise `security` returns whichever item matches the
/// service first, which is arbitrary when several exist.
#[tauri::command]
fn read_keychain_password(service: String, account: Option<String>) -> Result<String, String> {
    let mut args = vec!["find-generic-password", "-s", service.as_str()];
    if let Some(acct) = account.as_deref() {
        args.extend(["-a", acct]);
    }
    args.push("-w");
    let output = Command::new("security")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run security: {e}"))?;
    if !output.status.success() {
        return Err("Keychain item not found.".into());
    }
    String::from_utf8(output.stdout)
        .map(|s| s.trim().to_string())
        .map_err(|e| format!("Keychain output was not UTF-8: {e}"))
}

#[derive(serde::Serialize, Clone)]
struct KeychainEntry {
    account: String,
    /// Keychain modification timestamp, e.g. `20260909084709Z`.
    modified: Option<String>,
}

/// Pull a quoted blob value out of a `security dump-keychain` attribute line
/// such as `    "acct"<blob>="adamhiggins"`.
fn dump_blob_value(line: &str) -> Option<String> {
    let rest = line.split_once("=\"")?.1;
    Some(rest.strip_suffix('"').unwrap_or(rest).to_string())
}

/// Pull the ISO-ish timestamp out of a `"mdat"<timedate>=0x... "20260909084709Z\000"` line.
fn dump_timedate_value(line: &str) -> Option<String> {
    let rest = line.split_once("  \"")?.1;
    let end = rest.find(|c: char| !c.is_ascii_digit() && c != 'Z')?;
    let stamp = &rest[..end];
    (!stamp.is_empty()).then(|| stamp.to_string())
}

/// Parse `security dump-keychain` output (attributes only) into the accounts
/// stored under `service`, newest first.
fn parse_keychain_dump(text: &str, service: &str) -> Vec<KeychainEntry> {
    let mut entries: Vec<KeychainEntry> = Vec::new();
    let (mut acct, mut svce, mut mdat): (Option<String>, Option<String>, Option<String>) =
        (None, None, None);
    let mut flush = |acct: &mut Option<String>, svce: &mut Option<String>, mdat: &mut Option<String>| {
        if svce.as_deref() == Some(service) {
            if let Some(a) = acct.take().filter(|a| !a.is_empty()) {
                if !entries.iter().any(|e| e.account == a) {
                    entries.push(KeychainEntry { account: a, modified: mdat.take() });
                }
            }
        }
        *acct = None;
        *svce = None;
        *mdat = None;
    };
    for line in text.lines() {
        if line.starts_with("keychain:") {
            flush(&mut acct, &mut svce, &mut mdat);
            continue;
        }
        let t = line.trim_start();
        if t.starts_with("\"acct\"<blob>") {
            acct = dump_blob_value(t);
        } else if t.starts_with("\"svce\"<blob>") {
            svce = dump_blob_value(t);
        } else if t.starts_with("\"mdat\"<timedate>") {
            mdat = dump_timedate_value(t);
        }
    }
    flush(&mut acct, &mut svce, &mut mdat);

    entries.sort_by(|a, b| b.modified.cmp(&a.modified));
    entries
}

/// List Keychain accounts stored under `service`, newest first. Uses
/// `security dump-keychain` *without* `-d`, so no secrets are read; only
/// item attributes are parsed. Lets the UI offer a choice when several
/// logins share one service name.
#[tauri::command]
fn list_keychain_accounts(service: String) -> Result<Vec<KeychainEntry>, String> {
    let output = Command::new("security")
        .arg("dump-keychain")
        .output()
        .map_err(|e| format!("Failed to run security: {e}"))?;
    if !output.status.success() {
        return Err("Could not list Keychain items.".into());
    }
    Ok(parse_keychain_dump(&String::from_utf8_lossy(&output.stdout), &service))
}

#[cfg(test)]
mod keychain_tests {
    use super::parse_keychain_dump;

    const DUMP: &str = r#"keychain: "/Users/me/Library/Keychains/login.keychain-db"
version: 512
class: "genp"
attributes:
    0x00000007 <blob>="Claude Code-credentials"
    "acct"<blob>="unknown"
    "cdat"<timedate>=0x32303236303930383233333132375A00  "20260908233127Z\000"
    "mdat"<timedate>=0x32303236303930383233333132375A00  "20260908233127Z\000"
    "svce"<blob>="Claude Code-credentials"
keychain: "/Users/me/Library/Keychains/login.keychain-db"
version: 512
class: "genp"
attributes:
    "acct"<blob>="other"
    "mdat"<timedate>=0x32303236303930393038343730395A00  "20260909084709Z\000"
    "svce"<blob>="Something Else"
keychain: "/Users/me/Library/Keychains/login.keychain-db"
version: 512
class: "genp"
attributes:
    "acct"<blob>="adamhiggins"
    "mdat"<timedate>=0x32303236303930393038343730395A00  "20260909084709Z\000"
    "svce"<blob>="Claude Code-credentials"
keychain: "/Users/me/Library/Keychains/login.keychain-db"
class: "genp"
attributes:
    "acct"<blob>=<NULL>
    "svce"<blob>="Claude Code-credentials"
"#;

    #[test]
    fn lists_matching_accounts_newest_first() {
        let entries = parse_keychain_dump(DUMP, "Claude Code-credentials");
        let names: Vec<&str> = entries.iter().map(|e| e.account.as_str()).collect();
        assert_eq!(names, vec!["adamhiggins", "unknown"]);
        assert_eq!(entries[0].modified.as_deref(), Some("20260909084709Z"));
        assert_eq!(entries[1].modified.as_deref(), Some("20260908233127Z"));
    }

    #[test]
    fn ignores_other_services() {
        assert!(parse_keychain_dump(DUMP, "Nope").is_empty());
    }
}

fn dirs_home() -> Option<String> {
    std::env::var("HOME").ok()
}

#[derive(serde::Serialize)]
struct HttpResponse {
    status: u16,
    headers: HashMap<String, String>,
    /// UTF-8 text, or base64 when `encoding` is `"base64"`.
    body: String,
}

/// Fetch from Rust so the request has no webview Origin. Anthropic treats
/// Origin-bearing calls as CORS and some orgs reject those outright; Glaze
/// avoids this by fetching from Node instead of the renderer.
///
/// Pass `encoding: "base64"` for binary bodies (Open VSX VSIX packages).
#[tauri::command]
async fn http_request(
    url: String,
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    encoding: Option<String>,
) -> Result<HttpResponse, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let method: reqwest::Method = method
        .as_deref()
        .unwrap_or("GET")
        .parse()
        .map_err(|e| format!("Invalid HTTP method: {e}"))?;

    let mut request = client.request(method, &url);
    if let Some(headers) = headers {
        for (key, value) in headers {
            request = request.header(key, value);
        }
    }
    if let Some(body) = body {
        request = request.body(body);
    }

    let response = request.send().await.map_err(|e| format!("Request failed: {e}"))?;
    let status = response.status().as_u16();
    let mut response_headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(value) = value.to_str() {
            response_headers.insert(key.as_str().to_string(), value.to_string());
        }
    }
    let want_base64 = encoding.as_deref() == Some("base64");
    let body = if want_base64 {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }

    builder
        .manage(PanelState::default())
        .invoke_handler(tauri::generate_handler![
            hide_window,
            show_window,
            toggle_window,
            open_settings_popover,
            prepare_open_appearance,
            appearance_window_closed,
            read_home_file,
            read_keychain_password,
            list_keychain_accounts,
            http_request
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            if let Some(frame) = load_saved_frame(app.handle()) {
                if let Ok(mut saved) = app.state::<PanelState>().saved_frame.lock() {
                    *saved = Some(frame);
                }
            }

            if let Some(win) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    let panel = win
                        .to_panel::<MainPanel>()
                        .expect("convert main window to NSPanel");

                    let current_mask = panel.as_panel().styleMask();
                    let style = StyleMask::from_raw(current_mask).nonactivating_panel();
                    panel.set_style_mask(style.into());
                    panel.set_level(PanelLevel::Floating.into());

                    let behavior = CollectionBehavior::new()
                        .can_join_all_spaces()
                        .full_screen_auxiliary()
                        .transient()
                        .stationary()
                        .ignores_cycle();
                    panel.set_collection_behavior(behavior.into());
                }

                #[cfg(target_os = "macos")]
                {
                    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
                    let _ = apply_vibrancy(
                        &win,
                        NSVisualEffectMaterial::Popover,
                        Some(NSVisualEffectState::FollowsWindowActiveState),
                        Some(16.0),
                    );
                }

                let handle = app.handle().clone();
                win.on_window_event(move |event| match event {
                    tauri::WindowEvent::Focused(false) => {
                        let state = handle.state::<PanelState>();
                        if state.ignore_next_blur.load(Ordering::SeqCst) {
                            return;
                        }
                        hide_panel(&handle);
                    }
                    tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                        handle
                            .state::<PanelState>()
                            .ignore_next_blur
                            .store(true, Ordering::SeqCst);
                        remember_frame(&handle);
                        let clear = handle.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(400));
                            let state = clear.state::<PanelState>();
                            if !state.keep_app_active.load(Ordering::SeqCst) {
                                state.ignore_next_blur.store(false, Ordering::SeqCst);
                            }
                        });
                    }
                    _ => {}
                });
            }

            let show_item = MenuItem::with_id(app, "show", "Show Usage Monitor", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &settings_item, &quit_item])?;

            let handle = app.handle().clone();
            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().expect("app icon"))
                .icon_as_template(true)
                .tooltip("Usage Monitor")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => show_panel(app, None),
                    "settings" => open_settings(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        rect,
                        ..
                    } = event
                    {
                        toggle_panel(&handle, Some(rect));
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
