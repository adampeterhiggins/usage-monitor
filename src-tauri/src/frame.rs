//! Persisted main-window geometry: the panel reopens where the user last left
//! it, falling back to the tray icon when no frame is stored or the stored
//! frame has drifted off-screen.

use std::path::PathBuf;

use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewWindow};

#[derive(Clone, Copy, serde::Serialize, serde::Deserialize)]
pub(crate) struct WindowFrame {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn frame_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("window-frame.json"))
}

pub(crate) fn load(app: &AppHandle) -> Option<WindowFrame> {
    let data = std::fs::read_to_string(frame_path(app)?).ok()?;
    serde_json::from_str(&data).ok()
}

pub(crate) fn persist(app: &AppHandle, frame: WindowFrame) {
    let Some(path) = frame_path(app) else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string(&frame) {
        let _ = std::fs::write(path, json);
    }
}

/// The window's current frame in logical (point) coordinates.
pub(crate) fn current(win: &WebviewWindow) -> Option<WindowFrame> {
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

pub(crate) fn apply(win: &WebviewWindow, frame: WindowFrame) {
    let _ = win.set_size(LogicalSize::new(frame.width, frame.height));
    let _ = win.set_position(LogicalPosition::new(frame.x, frame.y));
}

/// A saved frame counts as usable when at least a 40×40 corner is still on a
/// connected monitor — display sets change between launches.
pub(crate) fn on_screen(win: &WebviewWindow, frame: WindowFrame) -> bool {
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
