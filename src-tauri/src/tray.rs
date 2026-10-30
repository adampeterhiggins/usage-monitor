//! Status-bar tray icon and its menu.

use tauri::image::Image;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::App;

use crate::panel;

/// Build the tray icon: left-click toggles the panel, right-click opens the
/// menu — usage per account plus Open / Refresh / Settings / Quit on macOS
/// (see `tray_menu`), a plain Show / Settings / Quit menu elsewhere.
pub(crate) fn build(app: &App) -> tauri::Result<()> {
    let handle = app.handle().clone();
    let builder = TrayIconBuilder::new()
        .icon(tray_icon()?)
        .icon_as_template(true)
        .tooltip("Usage Monitor")
        .on_tray_icon_event(move |tray, event| {
            // Only the macOS usage menu needs the tray handle.
            let _ = tray;
            let TrayIconEvent::Click {
                button,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            else {
                return;
            };
            match button {
                MouseButton::Left => panel::toggle(&handle, Some(rect)),
                #[cfg(target_os = "macos")]
                MouseButton::Right => crate::tray_menu::show(&handle, tray, rect),
                _ => {}
            }
        });

    #[cfg(not(target_os = "macos"))]
    let builder = with_text_menu(app, builder)?;

    builder.build(app)?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn with_text_menu(
    app: &App,
    builder: TrayIconBuilder<tauri::Wry>,
) -> tauri::Result<TrayIconBuilder<tauri::Wry>> {
    use tauri::menu::{Menu, MenuItem};

    let show_item = MenuItem::with_id(app, "show", "Show Usage Monitor", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &settings_item, &quit_item])?;
    Ok(builder
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show" => panel::show(app, None),
            "settings" => panel::open_settings(app),
            "quit" => app.exit(0),
            _ => {}
        }))
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
