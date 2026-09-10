//! Shared application state.
//!
//! `PanelState` coordinates the tray panel with the app's auxiliary windows
//! (Appearance, provider login). Its atomics form the "blur shield" protocol:
//! `ignore_next_blur` is armed before the panel shows, moves or resizes, then
//! released on a delay by `panel::schedule_release_blur_shield` — unless
//! `keep_app_active` or `account_modal_open` says an auxiliary window still
//! needs the app to stay active.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::Rect;

use crate::frame::WindowFrame;

pub(crate) struct PanelState {
    ignore_next_blur: AtomicBool,
    /// When true, hide the tray panel without calling NSApp.hide — used while the
    /// Appearance window is open so it isn't swept away with the panel.
    keep_app_active: AtomicBool,
    /// Add Account / Manage Accounts is open: behave like a normal app so login
    /// can Cmd-Tab back, and do not dismiss the panel on blur.
    account_modal_open: AtomicBool,
    last_tray_rect: Mutex<Option<Rect>>,
    saved_frame: Mutex<Option<WindowFrame>>,
}

impl Default for PanelState {
    fn default() -> Self {
        Self {
            ignore_next_blur: AtomicBool::new(false),
            keep_app_active: AtomicBool::new(false),
            account_modal_open: AtomicBool::new(false),
            last_tray_rect: Mutex::new(None),
            saved_frame: Mutex::new(None),
        }
    }
}

impl PanelState {
    /// A blur event right now should be ignored (the panel is showing, moving
    /// or resizing).
    pub(crate) fn blur_shielded(&self) -> bool {
        self.ignore_next_blur.load(Ordering::SeqCst)
    }

    pub(crate) fn arm_blur_shield(&self) {
        self.ignore_next_blur.store(true, Ordering::SeqCst);
    }

    pub(crate) fn release_blur_shield(&self) {
        self.ignore_next_blur.store(false, Ordering::SeqCst);
    }

    /// Drop the shield unless an auxiliary window still needs the app active.
    pub(crate) fn release_blur_shield_unless_held(&self) {
        if !self.holds_focus() {
            self.release_blur_shield();
        }
    }

    /// An auxiliary window (Appearance, account modal) is holding app focus.
    pub(crate) fn holds_focus(&self) -> bool {
        self.keep_app_active.load(Ordering::SeqCst)
            || self.account_modal_open.load(Ordering::SeqCst)
    }

    pub(crate) fn keep_app_active(&self) -> bool {
        self.keep_app_active.load(Ordering::SeqCst)
    }

    pub(crate) fn set_keep_app_active(&self, keep: bool) {
        self.keep_app_active.store(keep, Ordering::SeqCst);
    }

    pub(crate) fn account_modal_open(&self) -> bool {
        self.account_modal_open.load(Ordering::SeqCst)
    }

    /// Set the account-modal flag. Returns true when the value changed.
    pub(crate) fn set_account_modal_open(&self, open: bool) -> bool {
        self.account_modal_open.swap(open, Ordering::SeqCst) != open
    }

    pub(crate) fn last_tray_rect(&self) -> Option<Rect> {
        self.last_tray_rect.lock().ok().and_then(|rect| *rect)
    }

    pub(crate) fn set_last_tray_rect(&self, rect: Rect) {
        if let Ok(mut slot) = self.last_tray_rect.lock() {
            *slot = Some(rect);
        }
    }

    pub(crate) fn saved_frame(&self) -> Option<WindowFrame> {
        self.saved_frame.lock().ok().and_then(|frame| *frame)
    }

    pub(crate) fn set_saved_frame(&self, frame: WindowFrame) {
        if let Ok(mut slot) = self.saved_frame.lock() {
            *slot = Some(frame);
        }
    }
}
