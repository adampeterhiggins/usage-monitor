//! macOS-only window plumbing: NSPanel setup, AppKit activation, the Dock
//! icon, and switching the panel between floating-tray and interactive modes.
//!
//! `tauri_panel!` emits `use` items (`MainThreadMarker`, `NSRect`, `NSPoint`,
//! `NSSize`, …) into the enclosing module's scope, so everything that names
//! those types must live in this file.

use std::time::Duration;

use objc2_app_kit::{
    NSApplication, NSApplicationActivationOptions, NSImage, NSRunningApplication,
    NSWindowStyleMask, NSWorkspace,
};
use objc2_foundation::NSData;
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_nspanel::objc2::AnyThread;
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt,
};

use crate::panel;
use crate::state::PanelState;

tauri_panel! {
    panel!(MainPanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: true,
            is_floating_panel: true,
            becomes_key_only_if_needed: false,
            hides_on_deactivate: false
        }
    })
}

#[repr(C)]
struct ProcessSerialNumber {
    high_long_of_psn: u32,
    low_long_of_psn: u32,
}

const K_CURRENT_PROCESS: u32 = 2;
const PROCESS_TRANSFORM_TO_FOREGROUND_APPLICATION: u32 = 1;
const PROCESS_TRANSFORM_TO_UI_ELEMENT_APPLICATION: u32 = 4;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn GetCurrentProcess(psn: *mut ProcessSerialNumber) -> i32;
    fn TransformProcessType(psn: *mut ProcessSerialNumber, transform_state: u32) -> i32;
    fn SetFrontProcess(psn: *const ProcessSerialNumber) -> i32;
}

fn current_psn() -> ProcessSerialNumber {
    let mut psn = ProcessSerialNumber {
        high_long_of_psn: 0,
        low_long_of_psn: K_CURRENT_PROCESS,
    };
    unsafe {
        GetCurrentProcess(&mut psn);
    }
    psn
}

/// Make an LSUIElement process a real foreground app (or back). `setActivationPolicy`
/// alone adds us to Cmd-Tab at the end; TransformProcessType updates the switcher order.
fn transform_process(foreground: bool) {
    let mut psn = current_psn();
    let state = if foreground {
        PROCESS_TRANSFORM_TO_FOREGROUND_APPLICATION
    } else {
        PROCESS_TRANSFORM_TO_UI_ELEMENT_APPLICATION
    };
    unsafe {
        TransformProcessType(&mut psn, state);
    }
}

/// Activate as a foreground app, yielding from `yielding` (the app the user
/// was in before the panel became a regular window). The Dock only moves us
/// to the front of Cmd-Tab when it sees the frontmost app *change* to us.
fn activate_as_foreground(yielding: Option<&NSRunningApplication>) {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let ns_app = NSApplication::sharedApplication(mtm);
    ns_app.unhide(None);

    let current = NSRunningApplication::currentApplication();
    if let Some(front) = yielding {
        current.activateFromApplication_options(
            front,
            NSApplicationActivationOptions::ActivateAllWindows,
        );
    }
    ns_app.activate();
    current.activateWithOptions(NSApplicationActivationOptions::ActivateAllWindows);

    let psn = current_psn();
    unsafe {
        SetFrontProcess(&psn);
    }
}

fn resign_app_activation() {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let ns_app = NSApplication::sharedApplication(mtm);
    if ns_app.isActive() {
        ns_app.hide(None);
    }
}

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

fn tray_collection_behavior() -> CollectionBehavior {
    CollectionBehavior::new()
        .can_join_all_spaces()
        .full_screen_auxiliary()
        .transient()
        .stationary()
        .ignores_cycle()
}

fn interactive_collection_behavior() -> CollectionBehavior {
    CollectionBehavior::new()
        .can_join_all_spaces()
        .participates_in_cycle()
        .full_screen_auxiliary()
}

/// Convert the "main" window into a floating non-activating NSPanel and apply
/// popover vibrancy. Called once during app setup.
pub(crate) fn configure_main_panel(win: &WebviewWindow) {
    let panel = win
        .to_panel::<MainPanel>()
        .expect("convert main window to NSPanel");

    let current_mask = panel.as_panel().styleMask();
    let style = StyleMask::from_raw(current_mask).nonactivating_panel();
    panel.set_style_mask(style.into());
    panel.set_level(PanelLevel::Floating.into());
    panel.set_collection_behavior(tray_collection_behavior().into());

    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
    let _ = apply_vibrancy(
        win,
        NSVisualEffectMaterial::Popover,
        Some(NSVisualEffectState::FollowsWindowActiveState),
        Some(16.0),
    );
}

pub(crate) fn panel_visible(app: &AppHandle) -> bool {
    app.get_webview_panel("main")
        .map(|panel| panel.is_visible())
        .unwrap_or(false)
}

/// Show the panel and make it key, optionally activating as a foreground app.
///
/// Tauri's `set_focus` calls `activateIgnoringOtherApps:`. In tray mode the
/// non-activating panel must take key status *without* activating the app:
/// if we are already frontmost when we later switch to Regular, the Dock
/// appends us to the end of Cmd-Tab and no activate call moves us.
pub(crate) fn make_panel_key(app: &AppHandle, as_foreground: bool) {
    let Some(win) = panel::main_window(app) else {
        return;
    };

    if let Ok(panel) = app.get_webview_panel("main") {
        panel.show();
        if as_foreground {
            panel.make_main_window();
            panel.make_key_and_order_front();
            panel.order_front_regardless();
        } else {
            panel.make_key_window();
        }

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
    }

    if as_foreground {
        let _ = win.set_focus();
        activate_as_foreground(None);
    }
}

/// Hide the panel. When `keep_active` is false, also resign app activation so
/// the accessory app fully retreats to the menu bar.
pub(crate) fn hide_panel(app: &AppHandle, keep_active: bool) {
    if let Ok(panel) = app.get_webview_panel("main") {
        if panel.is_visible() {
            panel.resign_key_window();
            panel.hide();
        }
    }
    if !keep_active {
        resign_app_activation();
    }
}

fn apply_dock_icon() {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    const PNG: &[u8] = include_bytes!("../icons/icon-1024.png");
    let data = NSData::with_bytes(PNG);
    let Some(source) = NSImage::initWithData(NSImage::alloc(), &data) else {
        return;
    };

    // Bundled art is full-bleed. Dock / Cmd-Tab compare against Apple's 1024
    // icon grid, where the squircle is 824pt — so an edge-to-edge image reads
    // larger than Messages, Finder, etc.
    let canvas_size = NSSize::new(1024.0, 1024.0);
    let canvas = NSImage::initWithSize(NSImage::alloc(), canvas_size);
    #[allow(deprecated)]
    canvas.lockFocus();
    let glyph = 824.0;
    let inset = (1024.0 - glyph) / 2.0;
    source.drawInRect(NSRect::new(
        NSPoint::new(inset, inset),
        NSSize::new(glyph, glyph),
    ));
    #[allow(deprecated)]
    canvas.unlockFocus();

    let ns_app = NSApplication::sharedApplication(mtm);
    // Required when an LSUIElement process becomes Regular: macOS otherwise
    // shows the generic executable tile in the Dock / Cmd-Tab.
    unsafe { ns_app.setApplicationIconImage(Some(&canvas)) };
}

/// Flip the panel's style mask / level / collection behavior between the
/// floating non-activating tray look and an interactive regular window.
fn set_panel_interactive(app: &AppHandle, interactive: bool) {
    let Ok(panel) = app.get_webview_panel("main") else {
        return;
    };
    let mut mask = panel.as_panel().styleMask();
    if interactive {
        mask.remove(NSWindowStyleMask::NonactivatingPanel);
        panel.set_style_mask(mask);
        panel.set_collection_behavior(interactive_collection_behavior().into());
    } else {
        mask.insert(NSWindowStyleMask::NonactivatingPanel);
        panel.set_style_mask(mask);
        panel.set_floating_panel(true);
        panel.set_level(PanelLevel::Floating.into());
        panel.set_collection_behavior(tray_collection_behavior().into());
    }
}

/// Flip between Accessory (menu-bar only) and Regular (Dock / Cmd-Tab).
/// Returns the app we should hand activation back from, plus whether we were
/// the active app before the switch.
///
/// The Dock inserts a newly Regular app at the end of Cmd-Tab and only moves
/// it forward on a frontmost-app *transition*. So we must not be the active
/// app when the policy flips. Tray mode never activates us (see
/// `make_panel_key`); if something else did (e.g. the Appearance window),
/// hand activation back first and re-activate on a later turn.
fn switch_activation_policy(
    app: &AppHandle,
    open: bool,
) -> (Option<Retained<NSRunningApplication>>, bool) {
    let mut yielding = None;
    let mut was_active = false;
    if open {
        if let Some(mtm) = MainThreadMarker::new() {
            let ns_app = NSApplication::sharedApplication(mtm);
            was_active = ns_app.isActive();
            if was_active {
                ns_app.deactivate();
            }
        }
        let current_pid = std::process::id() as i32;
        yielding = NSWorkspace::sharedWorkspace()
            .frontmostApplication()
            .filter(|front| front.processIdentifier() != current_pid);
    }

    if open {
        transform_process(true);
    }
    let _ = app.set_activation_policy(if open {
        tauri::ActivationPolicy::Regular
    } else {
        tauri::ActivationPolicy::Accessory
    });
    if !open {
        transform_process(false);
    }

    (yielding, was_active)
}

/// Activate again on a later run-loop turn: the policy change and the
/// window-server side of TransformProcessType settle asynchronously.
fn reactivate_on_next_turn(app: &AppHandle, yielding: Option<Retained<NSRunningApplication>>) {
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(80));
        let on_main = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            if !on_main.state::<PanelState>().account_modal_open() {
                return;
            }
            if let Some(win) = panel::main_window(&on_main) {
                let _ = win.set_focus();
            }
            activate_as_foreground(yielding.as_deref());
            if let Ok(panel) = on_main.get_webview_panel("main") {
                panel.make_main_window();
                panel.make_key_and_order_front();
            }
        });
    });
}

/// Switch between tray mode and account-modal (interactive) mode.
///
/// Open: become a Regular app with a Dock icon and a normal key window so the
/// user can Cmd-Tab between us and a browser during provider login.
/// Close: back to a floating, non-activating accessory panel.
pub(crate) fn apply_modal_mode(app: &AppHandle, open: bool) {
    set_panel_interactive(app, open);

    let (yielding, was_active) = switch_activation_policy(app, open);

    if open {
        apply_dock_icon();
    }
    if let Some(win) = panel::main_window(app) {
        // Stay on top through the policy switch so the panel does not slip
        // behind other apps before we can make it key again.
        let _ = win.set_always_on_top(true);
        let _ = win.set_skip_taskbar(!open);
    }

    if open {
        if let Ok(panel) = app.get_webview_panel("main") {
            panel.set_floating_panel(false);
            panel.set_level(PanelLevel::Normal.into());
        }
        if let Some(win) = panel::main_window(app) {
            let _ = win.set_always_on_top(false);
        }
        if was_active {
            // Deactivate and activate in the same turn coalesce into no
            // transition. Let the deferred activation below do it.
            panel::make_key(app, false);
        } else {
            panel::make_key(app, true);
            activate_as_foreground(yielding.as_deref());
        }
        reactivate_on_next_turn(app, yielding);
    } else {
        if let Some(win) = panel::main_window(app) {
            let _ = win.set_always_on_top(true);
            let _ = win.set_skip_taskbar(true);
        }
        // Tray mode again: do not foreground-activate or the blur shield stays
        // up and the floating panel looks pinned over other apps.
        panel::make_key(app, false);
        panel::schedule_release_blur_shield(app);
    }
}
