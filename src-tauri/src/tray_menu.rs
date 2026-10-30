//! The status-item menu's usage summary.
//!
//! Usage is fetched in the webview, so the webview pushes a display-ready
//! snapshot here (`set_tray_menu`) whenever it changes; the menu is built
//! from the latest one each time it opens. The shape mirrors
//! `src/contracts/trayMenu.ts`.

#[cfg(target_os = "macos")]
mod appkit;

use std::sync::Mutex;

use serde::Deserialize;

#[cfg(target_os = "macos")]
pub(crate) use appkit::show;

/// Emitted when the menu opens, so the webview can refresh stale accounts.
pub(crate) const MENU_OPENED_EVENT: &str = "tray:menuOpened";
/// Emitted when Refresh is chosen in the menu.
pub(crate) const REFRESH_EVENT: &str = "tray:refresh";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Tone {
    Healthy,
    Warning,
    High,
    Critical,
    #[serde(other)]
    Neutral,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ProviderTone {
    Orange,
    Green,
    Blue,
    Purple,
    Teal,
    Pink,
    #[serde(other)]
    Slate,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Row {
    pub label: String,
    pub value: String,
    pub used_percent: Option<f64>,
    pub tone: Tone,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Summary {
    pub label: Option<String>,
    pub used_percent: Option<f64>,
    pub tone: Tone,
    pub text: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Account {
    pub provider_tone: ProviderTone,
    pub title: String,
    pub subtitle: Option<String>,
    pub summary: Summary,
    pub alert: Option<String>,
    pub rows: Vec<Row>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Snapshot {
    pub accounts: Vec<Account>,
    pub refresh_label: String,
}

/// The latest snapshot from the webview; `None` until it first reports.
#[derive(Default)]
pub(crate) struct TrayMenuState(Mutex<Option<Snapshot>>);

impl TrayMenuState {
    pub(crate) fn set(&self, snapshot: Snapshot) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(snapshot);
    }

    pub(crate) fn get(&self) -> Option<Snapshot> {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

/// Fraction of a bar to fill, clamped to 0…1.
pub(crate) fn fill_fraction(used_percent: f64) -> f64 {
    if used_percent.is_finite() {
        (used_percent / 100.0).clamp(0.0, 1.0)
    } else {
        0.0
    }
}

/// Shorten `text` to at most `max` characters, ending in an ellipsis.
pub(crate) fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let kept: String = text.chars().take(max.saturating_sub(1)).collect();
    format!("{}…", kept.trim_end())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_webview_snapshot() {
        let json = r#"{
            "accounts": [{
                "providerTone": "orange",
                "title": "Claude · Work",
                "subtitle": "Team",
                "summary": { "label": "Weekly", "usedPercent": 63, "tone": "warning", "text": "63%" },
                "rows": [
                    { "label": "Weekly", "value": "63%", "usedPercent": 63, "tone": "warning" },
                    { "label": "Credits", "value": "$20.62", "tone": "neutral" }
                ]
            }, {
                "providerTone": "chartreuse",
                "title": "Someday",
                "summary": { "tone": "info", "text": "Loading…" },
                "alert": "Couldn’t refresh",
                "rows": []
            }],
            "refreshLabel": "Updated just now"
        }"#;
        let snapshot: Snapshot = serde_json::from_str(json).expect("parse snapshot");
        assert_eq!(snapshot.accounts.len(), 2);
        let claude = &snapshot.accounts[0];
        assert_eq!(claude.provider_tone, ProviderTone::Orange);
        assert_eq!(claude.summary.tone, Tone::Warning);
        assert_eq!(claude.rows[1].used_percent, None);
        let unknown = &snapshot.accounts[1];
        assert_eq!(unknown.provider_tone, ProviderTone::Slate);
        assert_eq!(unknown.summary.tone, Tone::Neutral);
        assert_eq!(unknown.alert.as_deref(), Some("Couldn’t refresh"));
    }

    #[test]
    fn clamps_fill() {
        assert_eq!(fill_fraction(-5.0), 0.0);
        assert_eq!(fill_fraction(63.0), 0.63);
        assert_eq!(fill_fraction(140.0), 1.0);
        assert_eq!(fill_fraction(f64::NAN), 0.0);
    }

    #[test]
    fn truncates_on_characters() {
        assert_eq!(truncate("Claude · Work", 20), "Claude · Work");
        assert_eq!(truncate("Claude · adam@focaldata.com", 12), "Claude · ad…");
    }
}
