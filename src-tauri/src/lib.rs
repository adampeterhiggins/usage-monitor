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
    last_tray_rect: Mutex<Option<Rect>>,
    saved_frame: Mutex<Option<WindowFrame>>,
}

impl Default for PanelState {
    fn default() -> Self {
        Self {
            ignore_next_blur: AtomicBool::new(false),
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

fn show_panel(app: &AppHandle, tray_bounds: Option<Rect>) {
    let Some(win) = main_window(app) else { return };
    let was_visible = win.is_visible().unwrap_or(false);
    let state = app.state::<PanelState>();

    place_panel(app, &win, tray_bounds);

    state.ignore_next_blur.store(true, Ordering::SeqCst);
    let _ = win.show();
    let _ = win.set_focus();

    if !was_visible {
        let _ = win.emit(WINDOW_SHOWN_EVENT, ());
    }

    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(250));
        handle
            .state::<PanelState>()
            .ignore_next_blur
            .store(false, Ordering::SeqCst);
    });
}

fn hide_panel(app: &AppHandle) {
    remember_frame(app);
    if let Some(win) = main_window(app) {
        let _ = win.hide();
    }
}

fn toggle_panel(app: &AppHandle, tray_bounds: Option<Rect>) {
    let visible = main_window(app)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    if visible {
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

/// Read a file under the user's home directory (Codex auth.json, Claude credentials).
#[tauri::command]
fn read_home_file(rel_path: String) -> Result<String, String> {
    let home = dirs_home().ok_or_else(|| "Could not resolve the home directory.".to_string())?;
    let path = std::path::Path::new(&home).join(rel_path);
    std::fs::read_to_string(&path).map_err(|e| format!("Could not read {}: {e}", path.display()))
}

/// Read a generic password from the macOS Keychain (Claude Code login).
#[tauri::command]
fn read_keychain_password(service: String) -> Result<String, String> {
    let output = Command::new("security")
        .args(["find-generic-password", "-s", &service, "-w"])
        .output()
        .map_err(|e| format!("Failed to run security: {e}"))?;
    if !output.status.success() {
        return Err("Keychain item not found.".into());
    }
    String::from_utf8(output.stdout)
        .map(|s| s.trim().to_string())
        .map_err(|e| format!("Keychain output was not UTF-8: {e}"))
}

fn dirs_home() -> Option<String> {
    std::env::var("HOME").ok()
}

#[derive(serde::Serialize)]
struct HttpResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: String,
}

/// Fetch from Rust so the request has no webview Origin. Anthropic treats
/// Origin-bearing calls as CORS and some orgs reject those outright; Glaze
/// avoids this by fetching from Node instead of the renderer.
#[tauri::command]
async fn http_request(
    url: String,
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
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
    let body = response.text().await.map_err(|e| format!("Failed to read response: {e}"))?;
    Ok(HttpResponse {
        status,
        headers: response_headers,
        body,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(PanelState::default())
        .invoke_handler(tauri::generate_handler![
            hide_window,
            show_window,
            toggle_window,
            open_settings_popover,
            read_home_file,
            read_keychain_password,
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
                            clear
                                .state::<PanelState>()
                                .ignore_next_blur
                                .store(false, Ordering::SeqCst);
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
