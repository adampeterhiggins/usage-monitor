//! Tray panel lifecycle: placement, show/hide/toggle, and the focus/blur
//! coordination that keeps a menu-bar popover behaving like a popover while
//! in-panel modal dialogs (accounts, appearance, provider login) are open.
//!
//! Platform-specific mechanics live in `crate::macos` — this module holds the
//! cross-platform policy and dispatches through thin `#[cfg]` seams.

use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Rect, WebviewWindow};

use crate::frame;
use crate::state::PanelState;

const WINDOW_SHOWN_EVENT: &str = "window:shown";
const OPEN_SETTINGS_EVENT: &str = "settings:openPopover";

pub(crate) fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
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
            x >= pos.x
                && x < pos.x + size.width as i32
                && y >= pos.y
                && y < pos.y + size.height as i32
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

/// Snapshot the current frame into state and onto disk.
fn remember_frame(app: &AppHandle) {
    let Some(win) = main_window(app) else { return };
    let Some(frame) = frame::current(&win) else {
        return;
    };
    app.state::<PanelState>().set_saved_frame(frame);
    frame::persist(app, frame);
}

/// Load the persisted frame into shared state at startup.
pub(crate) fn restore_saved_frame(app: &AppHandle) {
    if let Some(frame) = frame::load(app) {
        app.state::<PanelState>().set_saved_frame(frame);
    }
}

fn place_panel(app: &AppHandle, win: &WebviewWindow, tray_bounds: Option<Rect>) {
    let state = app.state::<PanelState>();
    if let Some(bounds) = tray_bounds {
        state.set_last_tray_rect(bounds);
    }

    if let Some(saved) = state.saved_frame() {
        if frame::on_screen(win, saved) {
            frame::apply(win, saved);
            return;
        }
    }

    if let Some(bounds) = tray_bounds.or_else(|| state.last_tray_rect()) {
        position_under_tray(win, bounds);
    } else {
        center_on_cursor_screen(win);
    }
}

#[cfg(target_os = "macos")]
fn panel_visible(app: &AppHandle) -> bool {
    crate::macos::panel_visible(app)
}

#[cfg(not(target_os = "macos"))]
fn panel_visible(app: &AppHandle) -> bool {
    main_window(app)
        .and_then(|win| win.is_visible().ok())
        .unwrap_or(false)
}

/// Arm the blur shield, then make the panel key. `as_foreground` also
/// activates the app (account-modal mode); tray mode never activates.
pub(crate) fn make_key(app: &AppHandle, as_foreground: bool) {
    app.state::<PanelState>().arm_blur_shield();
    make_key_platform(app, as_foreground);
}

#[cfg(target_os = "macos")]
fn make_key_platform(app: &AppHandle, as_foreground: bool) {
    crate::macos::make_panel_key(app, as_foreground);
}

#[cfg(not(target_os = "macos"))]
fn make_key_platform(app: &AppHandle, as_foreground: bool) {
    if let Some(win) = main_window(app) {
        let _ = win.show();
        let _ = win.set_focus();
    }
    let _ = as_foreground;
}

#[cfg(target_os = "macos")]
fn panel_is_key(app: &AppHandle) -> bool {
    crate::macos::panel_is_key(app)
}

#[cfg(not(target_os = "macos"))]
fn panel_is_key(app: &AppHandle) -> bool {
    main_window(app)
        .and_then(|win| win.is_focused().ok())
        .unwrap_or(false)
}

/// Drop the blur shield shortly after a show/move — long enough for focus
/// churn to settle, short enough that a real click-away still dismisses.
///
/// Before dropping it, make sure the panel still holds key status. A blur
/// that landed while the shield was up (most often the deferred app
/// deactivation that follows the Regular → Accessory switch when an account
/// modal closes) was swallowed, leaving the panel visible but not key. No
/// later click-away can produce a blur in that state, so the panel would sit
/// pinned over other apps until the user clicked it and away again. Taking
/// key status back (without activating the app) restores the normal
/// blur-to-hide path.
pub(crate) fn schedule_release_blur_shield(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        let on_main = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            let state = on_main.state::<PanelState>();
            if state.holds_focus() {
                return;
            }
            if panel_visible(&on_main) && !panel_is_key(&on_main) {
                make_key_platform(&on_main, false);
            }
            state.release_blur_shield();
        });
    });
}

pub(crate) fn show(app: &AppHandle, tray_bounds: Option<Rect>) {
    let Some(win) = main_window(app) else { return };
    let was_visible = panel_visible(app);

    place_panel(app, &win, tray_bounds);
    make_key(app, false);

    if !was_visible {
        let _ = win.emit(WINDOW_SHOWN_EVENT, ());
    }

    schedule_release_blur_shield(app);
}

pub(crate) fn hide(app: &AppHandle) {
    if app.state::<PanelState>().account_modal_open() {
        return;
    }

    remember_frame(app);
    hide_platform(app);
}

#[cfg(target_os = "macos")]
fn hide_platform(app: &AppHandle) {
    crate::macos::hide_panel(app);
}

#[cfg(not(target_os = "macos"))]
fn hide_platform(app: &AppHandle) {
    if let Some(win) = main_window(app) {
        let _ = win.hide();
    }
}

pub(crate) fn toggle(app: &AppHandle, tray_bounds: Option<Rect>) {
    if panel_visible(app) {
        if app.state::<PanelState>().account_modal_open() {
            // Don't dismiss an in-progress login; bring the panel forward.
            show(app, tray_bounds);
            return;
        }
        hide(app);
    } else {
        show(app, tray_bounds);
    }
}

pub(crate) fn open_settings(app: &AppHandle) {
    show(app, None);
    if let Some(win) = main_window(app) {
        let _ = win.emit(OPEN_SETTINGS_EVENT, ());
    }
}

/// While Add Account or Manage Accounts is open, become a normal app (Dock /
/// Cmd-Tab) and do not hide the panel when the browser takes focus.
pub(crate) fn set_account_modal(app: &AppHandle, open: bool) {
    let state = app.state::<PanelState>();
    if !state.set_account_modal_open(open) {
        return;
    }
    if open {
        state.arm_blur_shield();
    } else {
        state.release_blur_shield();
    }
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || apply_modal_mode(&handle, open));
}

#[cfg(target_os = "macos")]
fn apply_modal_mode(app: &AppHandle, open: bool) {
    crate::macos::apply_modal_mode(app, open);
}

#[cfg(not(target_os = "macos"))]
fn apply_modal_mode(app: &AppHandle, open: bool) {
    if let Some(win) = main_window(app) {
        let _ = win.set_always_on_top(true);
        let _ = win.set_skip_taskbar(!open);
    }

    if open {
        if let Some(win) = main_window(app) {
            let _ = win.set_always_on_top(false);
        }
        make_key(app, true);
    } else {
        make_key(app, false);
        schedule_release_blur_shield(app);
    }
}

/// Configure the "main" window at startup: NSPanel + vibrancy on macOS, and
/// the focus/move event wiring shared by all platforms.
pub(crate) fn setup_main_window(app: &AppHandle) {
    let Some(win) = main_window(app) else { return };

    #[cfg(target_os = "macos")]
    crate::macos::configure_main_panel(&win);

    let handle = app.clone();
    win.on_window_event(move |event| on_window_event(&handle, event));
}

fn on_window_event(handle: &AppHandle, event: &tauri::WindowEvent) {
    match event {
        tauri::WindowEvent::Focused(false) => {
            let state = handle.state::<PanelState>();
            if state.blur_shielded() || state.account_modal_open() {
                return;
            }
            hide(handle);
        }
        tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
            handle.state::<PanelState>().arm_blur_shield();
            remember_frame(handle);
            schedule_release_blur_shield(handle);
        }
        _ => {}
    }
}
