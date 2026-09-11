//! Status-bar tray icon and its menu.

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::App;

use crate::panel;

/// Build the tray icon: left-click toggles the panel, right-click menu offers
/// Show / Settings / Quit.
pub(crate) fn build(app: &App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Show Usage Monitor", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &settings_item, &quit_item])?;

    let handle = app.handle().clone();
    TrayIconBuilder::new()
        .icon(tray_icon()?)
        .icon_as_template(true)
        .tooltip("Usage Monitor")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show" => panel::show(app, None),
            "settings" => panel::open_settings(app),
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
                panel::toggle(&handle, Some(rect));
            }
        })
        .build(app)?;

    Ok(())
}

/// The menu-bar glyph: the app icon's three chart bars, alone, on transparency.
///
/// macOS treats a template image as a mask — only alpha matters, and the
/// system paints it black or white to suit the menu bar (and light/dark mode,
/// and the highlighted state). So the tray cannot reuse the app icon: its
/// opaque rounded square would render as a solid block with the bars lost
/// inside it. The PNG is authored at 2× by `scripts/make-icon.py`; tray-icon
/// scales it to 18pt tall.
fn tray_icon() -> tauri::Result<Image<'static>> {
    const PNG: &[u8] = include_bytes!("../icons/tray-template.png");
    Image::from_bytes(PNG)
}
