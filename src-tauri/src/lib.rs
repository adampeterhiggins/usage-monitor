//! Usage Monitor — a menu-bar app that tracks LLM provider usage limits.
//!
//! Module map:
//! - `commands`: the `#[tauri::command]` IPC surface (thin wrappers only)
//! - `panel`: tray panel lifecycle — placement, focus, the blur-shield protocol
//! - `macos`: AppKit/NSPanel mechanics (compiled only on macOS)
//! - `tray`: status-bar icon and menu
//! - `state`: `PanelState`, shared window/panel flags
//! - `frame`: persisted window geometry
//! - `credentials`: provider login reads (Keychain, Cursor IDE DB, home files)
//! - `http`: native fetch so requests carry no webview Origin

mod commands;
mod credentials;
mod frame;
mod http;
#[cfg(target_os = "macos")]
mod macos;
mod oauth;
mod panel;
mod state;
mod tray;

use state::PanelState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
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
            commands::hide_window,
            commands::show_window,
            commands::toggle_window,
            commands::open_settings_popover,
            commands::set_account_modal_open,
            commands::read_home_file,
            commands::read_keychain_password,
            commands::list_keychain_accounts,
            commands::cursor_ide_login_meta,
            commands::read_cursor_ide_access_token,
            commands::http_request,
            commands::oauth_listen,
            commands::oauth_wait,
            commands::oauth_cancel
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            panel::restore_saved_frame(app.handle());
            panel::setup_main_window(app.handle());
            tray::build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
