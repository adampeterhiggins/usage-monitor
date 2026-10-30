//! The status-item menu, drawn with AppKit.
//!
//! One row per account shows its tightest window as an inline bar; hovering
//! it opens a submenu with every window as a labelled bar. Tauri's menu API
//! can only show text, so the menu is built here and handed to the status
//! item for one click (the same `setMenu` / `performClick` / `setMenu(nil)`
//! dance tray-icon does for its own menus).
//!
//! Account rows keep native, attributed titles — image attachments for the
//! dot and bar, tab stops for the columns — so hover highlight and submenu
//! arrows behave like any other menu. The submenu's usage rows are never
//! selected, so they are plain custom views.

use std::cell::Cell;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Bool, NSObject};
use objc2::{define_class, msg_send, sel, AllocAnyThread, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSAttributedStringAttachmentConveniences, NSBezierPath, NSColor, NSFont, NSFontAttributeName,
    NSFontWeightRegular, NSFontWeightSemibold, NSForegroundColorAttributeName, NSImage,
    NSImageView, NSLineBreakMode, NSMenu, NSMenuItem, NSMutableParagraphStyle,
    NSParagraphStyleAttributeName, NSTextAlignment, NSTextAttachment, NSTextField, NSTextTab,
    NSView,
};
use objc2_foundation::{
    NSArray, NSAttributedString, NSAttributedStringKey, NSDictionary, NSMutableAttributedString,
    NSPoint, NSRect, NSSize, NSString,
};
use tauri::tray::TrayIcon;
use tauri::{AppHandle, Emitter, Manager, Rect};

use super::{
    fill_fraction, truncate, Account, ProviderTone, Row, Snapshot, Tone, TrayMenuState,
    MENU_OPENED_EVENT, REFRESH_EVENT,
};
use crate::panel;

/// Top-level account rows: where the bar column starts and where the
/// percentage column ends, measured from the start of the title.
const BAR_TAB: f64 = 200.0;
const VALUE_TAB: f64 = 300.0;
const SUMMARY_BAR: NSSize = NSSize::new(64.0, 5.0);
/// Title plus window name beyond this crowds the bar column, so the window
/// name is dropped (the submenu still has it).
const ROW_TEXT_BUDGET: usize = 28;

/// Submenu usage rows.
const DETAIL_WIDTH: f64 = 300.0;
const DETAIL_INSET: f64 = 14.0;

#[derive(Clone, Copy)]
enum Action {
    Open = 1,
    Refresh,
    Settings,
    Quit,
}

impl Action {
    fn from_tag(tag: isize) -> Option<Self> {
        [Self::Open, Self::Refresh, Self::Settings, Self::Quit]
            .into_iter()
            .find(|a| *a as isize == tag)
    }
}

thread_local! {
    /// The tag of the item chosen while the menu was open.
    static CHOSEN: Cell<Option<isize>> = const { Cell::new(None) };
}

define_class!(
    // SAFETY: NSObject has no subclassing requirements, and MenuTarget has
    // no ivars and no Drop.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "UsageMonitorTrayMenuTarget"]
    struct MenuTarget;

    impl MenuTarget {
        #[unsafe(method(choose:))]
        fn choose(&self, item: &NSMenuItem) {
            CHOSEN.with(|c| c.set(Some(item.tag())));
        }
    }
);

impl MenuTarget {
    fn new(mtm: MainThreadMarker) -> Retained<Self> {
        unsafe { msg_send![Self::alloc(mtm), init] }
    }
}

/// Open the usage menu from the status item and run whatever was chosen.
/// Call on the main thread (tray events are delivered there).
pub(crate) fn show(app: &AppHandle, tray: &TrayIcon, tray_rect: Rect) {
    let snapshot = app.state::<TrayMenuState>().get();
    if let Some(win) = panel::main_window(app) {
        let _ = win.emit(MENU_OPENED_EVENT, ());
    }

    let chosen = tray
        .with_inner_tray_icon(move |inner| {
            let mtm = MainThreadMarker::new()?;
            let status_item = inner.ns_status_item()?;
            let target = MenuTarget::new(mtm);
            let menu = build_menu(snapshot.as_ref(), &target, mtm);

            CHOSEN.with(|c| c.set(None));
            status_item.setMenu(Some(&menu));
            if let Some(button) = status_item.button(mtm) {
                // Runs the menu's tracking loop; returns once it closes.
                unsafe { button.performClick(None) };
            }
            status_item.setMenu(None);
            CHOSEN.with(Cell::take)
        })
        .ok()
        .flatten()
        .and_then(Action::from_tag);

    match chosen {
        Some(Action::Open) => panel::show(app, Some(tray_rect)),
        Some(Action::Refresh) => {
            if let Some(win) = panel::main_window(app) {
                let _ = win.emit(REFRESH_EVENT, ());
            }
        }
        Some(Action::Settings) => panel::open_settings(app),
        Some(Action::Quit) => app.exit(0),
        None => {}
    }
}

fn build_menu(
    snapshot: Option<&Snapshot>,
    target: &MenuTarget,
    mtm: MainThreadMarker,
) -> Retained<NSMenu> {
    let menu = NSMenu::new(mtm);
    menu.setAutoenablesItems(false);

    if let Some(snapshot) = snapshot {
        if snapshot.accounts.is_empty() {
            menu.addItem(&disabled_item(&plain("No accounts yet"), mtm));
        } else {
            menu.addItem(&disabled_item(&section_header("Usage limits"), mtm));
            for account in &snapshot.accounts {
                menu.addItem(&account_item(account, target, mtm));
            }
        }
        menu.addItem(&NSMenuItem::separatorItem(mtm));
    }

    menu.addItem(&action_item(
        "Open Usage Monitor",
        Action::Open,
        "",
        target,
        mtm,
    ));
    let refresh = action_item("Refresh", Action::Refresh, "", target, mtm);
    if let Some(snapshot) = snapshot {
        refresh.setAttributedTitle(Some(&with_trailing_note(
            "Refresh",
            &snapshot.refresh_label,
        )));
    }
    menu.addItem(&refresh);
    menu.addItem(&action_item(
        "Settings…",
        Action::Settings,
        ",",
        target,
        mtm,
    ));
    menu.addItem(&NSMenuItem::separatorItem(mtm));
    menu.addItem(&action_item(
        "Quit Usage Monitor",
        Action::Quit,
        "q",
        target,
        mtm,
    ));
    menu
}

/// "● Claude · Work  Weekly      ▬▬▬▬▭▭   63%  ›"
fn account_item(
    account: &Account,
    target: &MenuTarget,
    mtm: MainThreadMarker,
) -> Retained<NSMenuItem> {
    let style = tab_style(&[
        (NSTextAlignment::Left, BAR_TAB),
        (NSTextAlignment::Right, VALUE_TAB),
    ]);
    let font = NSFont::menuFontOfSize(0.0);
    let small = NSFont::systemFontOfSize(12.0);
    let digits =
        NSFont::monospacedDigitSystemFontOfSize_weight(12.0, unsafe { NSFontWeightRegular });
    let secondary = NSColor::secondaryLabelColor();

    let title = NSMutableAttributedString::new();
    title.appendAttributedString(&attachment(&dot_image(account.provider_tone), 0.0));
    let name = truncate(&account.title, 22);
    title.appendAttributedString(&styled(&format!("  {name}"), &font, None, Some(&style)));
    if let Some(label) = &account.summary.label {
        if name.chars().count() + label.chars().count() <= ROW_TEXT_BUDGET {
            title.appendAttributedString(&styled(
                &format!("  {label}"),
                &small,
                Some(&secondary),
                Some(&style),
            ));
        }
    }
    title.appendAttributedString(&styled("\t", &font, None, Some(&style)));
    if let Some(pct) = account.summary.used_percent {
        title.appendAttributedString(&attachment(
            &bar_image(fill_fraction(pct), account.summary.tone, SUMMARY_BAR),
            1.0,
        ));
    }
    title.appendAttributedString(&styled(
        &format!("\t{}", account.summary.text),
        &digits,
        None,
        Some(&style),
    ));

    let item = menu_item("", None, "", mtm);
    item.setAttributedTitle(Some(&title));
    item.setSubmenu(Some(&account_submenu(account, target, mtm)));
    item
}

fn account_submenu(
    account: &Account,
    target: &MenuTarget,
    mtm: MainThreadMarker,
) -> Retained<NSMenu> {
    let menu = NSMenu::new(mtm);
    menu.setAutoenablesItems(false);

    let header = NSMutableAttributedString::new();
    let bold = NSFont::systemFontOfSize_weight(13.0, unsafe { NSFontWeightSemibold });
    header.appendAttributedString(&styled(&account.title, &bold, None, None));
    if let Some(plan) = &account.subtitle {
        header.appendAttributedString(&styled(
            &format!(" · {plan}"),
            &NSFont::systemFontOfSize(13.0),
            Some(&NSColor::secondaryLabelColor()),
            None,
        ));
    }
    menu.addItem(&disabled_item(&header, mtm));

    for row in &account.rows {
        let item = NSMenuItem::new(mtm);
        item.setView(Some(&usage_row_view(row, mtm)));
        menu.addItem(&item);
    }
    if let Some(alert) = &account.alert {
        menu.addItem(&disabled_item(&plain(&truncate(alert, 60)), mtm));
    } else if account.rows.is_empty() {
        menu.addItem(&disabled_item(&plain(&account.summary.text), mtm));
    }

    menu.addItem(&NSMenuItem::separatorItem(mtm));
    menu.addItem(&action_item(
        "Open Usage Monitor",
        Action::Open,
        "",
        target,
        mtm,
    ));
    menu
}

/// "Weekly · all models              63% · resets in 3 d 2 hr"
/// "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▭▭▭▭▭▭▭▭▭▭"
fn usage_row_view(row: &Row, mtm: MainThreadMarker) -> Retained<NSView> {
    let fraction = row.used_percent.map(fill_fraction);
    let height = if fraction.is_some() { 40.0 } else { 24.0 };
    let view = NSView::initWithFrame(NSView::alloc(mtm), rect(0.0, 0.0, DETAIL_WIDTH, height));
    let text_y = height - 21.0;
    let inner_width = DETAIL_WIDTH - 2.0 * DETAIL_INSET;

    let value = label(&row.value, mtm);
    value.setFont(Some(&NSFont::monospacedDigitSystemFontOfSize_weight(
        12.0,
        unsafe { NSFontWeightRegular },
    )));
    value.setTextColor(Some(&NSColor::secondaryLabelColor()));
    value.setAlignment(NSTextAlignment::Right);
    value.sizeToFit();
    let value_width = value.frame().size.width.min(inner_width * 0.6);
    value.setFrame(rect(
        DETAIL_WIDTH - DETAIL_INSET - value_width,
        text_y,
        value_width,
        17.0,
    ));

    let name = label(&row.label, mtm);
    name.setFont(Some(&NSFont::menuFontOfSize(13.0)));
    name.setFrame(rect(
        DETAIL_INSET,
        text_y,
        inner_width - value_width - 8.0,
        17.0,
    ));

    view.addSubview(&name);
    view.addSubview(&value);
    if let Some(fraction) = fraction {
        let bar = bar_image(fraction, row.tone, NSSize::new(inner_width, 6.0));
        let bar_view = NSImageView::imageViewWithImage(&bar, mtm);
        bar_view.setFrame(rect(DETAIL_INSET, 9.0, inner_width, 6.0));
        view.addSubview(&bar_view);
    }
    view
}

// ---------------------------------------------------------------- drawing

fn tone_color(tone: Tone) -> Retained<NSColor> {
    match tone {
        Tone::Healthy => NSColor::systemGreenColor(),
        Tone::Warning => NSColor::systemYellowColor(),
        Tone::High => NSColor::systemOrangeColor(),
        Tone::Critical => NSColor::systemRedColor(),
        Tone::Neutral => NSColor::systemGrayColor(),
    }
}

fn provider_color(tone: ProviderTone) -> Retained<NSColor> {
    match tone {
        ProviderTone::Orange => NSColor::systemOrangeColor(),
        ProviderTone::Green => NSColor::systemGreenColor(),
        ProviderTone::Blue => NSColor::systemBlueColor(),
        ProviderTone::Purple => NSColor::systemPurpleColor(),
        ProviderTone::Teal => NSColor::systemTealColor(),
        ProviderTone::Pink => NSColor::systemPinkColor(),
        ProviderTone::Slate => NSColor::systemGrayColor(),
    }
}

fn rounded(rect: NSRect, radius: f64) -> Retained<NSBezierPath> {
    NSBezierPath::bezierPathWithRoundedRect_xRadius_yRadius(rect, radius, radius)
}

/// A track with `fraction` of it filled in the tone's colour. Drawn on
/// demand, so the system colours follow light and dark mode.
fn bar_image(fraction: f64, tone: Tone, size: NSSize) -> Retained<NSImage> {
    let draw = RcBlock::new(move |bounds: NSRect| -> Bool {
        let radius = bounds.size.height / 2.0;
        NSColor::quaternaryLabelColor().setFill();
        rounded(bounds, radius).fill();
        if fraction > 0.0 {
            let width = (bounds.size.width * fraction).max(bounds.size.height);
            tone_color(tone).setFill();
            rounded(
                NSRect::new(bounds.origin, NSSize::new(width, bounds.size.height)),
                radius,
            )
            .fill();
        }
        Bool::YES
    });
    NSImage::imageWithSize_flipped_drawingHandler(size, false, &draw)
}

fn dot_image(tone: ProviderTone) -> Retained<NSImage> {
    let draw = RcBlock::new(move |bounds: NSRect| -> Bool {
        provider_color(tone).setFill();
        rounded(bounds, 2.0).fill();
        Bool::YES
    });
    NSImage::imageWithSize_flipped_drawingHandler(NSSize::new(8.0, 8.0), false, &draw)
}

// ------------------------------------------------------------ text & items

fn rect(x: f64, y: f64, width: f64, height: f64) -> NSRect {
    NSRect::new(NSPoint::new(x, y), NSSize::new(width, height))
}

fn styled(
    text: &str,
    font: &NSFont,
    color: Option<&NSColor>,
    style: Option<&NSMutableParagraphStyle>,
) -> Retained<NSAttributedString> {
    let mut keys: Vec<&NSAttributedStringKey> = vec![unsafe { NSFontAttributeName }];
    let mut values: Vec<&AnyObject> = vec![font];
    if let Some(color) = color {
        keys.push(unsafe { NSForegroundColorAttributeName });
        values.push(color);
    }
    if let Some(style) = style {
        keys.push(unsafe { NSParagraphStyleAttributeName });
        values.push(style);
    }
    let attrs = NSDictionary::from_slices(&keys, &values);
    unsafe {
        NSAttributedString::initWithString_attributes(
            NSAttributedString::alloc(),
            &NSString::from_str(text),
            Some(&attrs),
        )
    }
}

fn plain(text: &str) -> Retained<NSAttributedString> {
    styled(text, &NSFont::menuFontOfSize(0.0), None, None)
}

fn section_header(text: &str) -> Retained<NSAttributedString> {
    let font = NSFont::systemFontOfSize_weight(11.0, unsafe { NSFontWeightSemibold });
    styled(
        &text.to_uppercase(),
        &font,
        Some(&NSColor::secondaryLabelColor()),
        None,
    )
}

/// "Refresh                      Updated 2 min ago"
fn with_trailing_note(title: &str, note: &str) -> Retained<NSMutableAttributedString> {
    let style = tab_style(&[(NSTextAlignment::Right, VALUE_TAB)]);
    let text = NSMutableAttributedString::new();
    text.appendAttributedString(&styled(
        title,
        &NSFont::menuFontOfSize(0.0),
        None,
        Some(&style),
    ));
    text.appendAttributedString(&styled(
        &format!("\t{note}"),
        &NSFont::systemFontOfSize(12.0),
        Some(&NSColor::secondaryLabelColor()),
        Some(&style),
    ));
    text
}

fn tab_style(stops: &[(NSTextAlignment, f64)]) -> Retained<NSMutableParagraphStyle> {
    let tabs: Vec<Retained<NSTextTab>> = stops
        .iter()
        .map(|&(alignment, location)| unsafe {
            NSTextTab::initWithTextAlignment_location_options(
                NSTextTab::alloc(),
                alignment,
                location,
                &NSDictionary::new(),
            )
        })
        .collect();
    let style = NSMutableParagraphStyle::new();
    style.setTabStops(Some(&NSArray::from_retained_slice(&tabs)));
    style
}

fn attachment(image: &NSImage, baseline_offset: f64) -> Retained<NSAttributedString> {
    let attachment = NSTextAttachment::new();
    attachment.setImage(Some(image));
    attachment.setBounds(NSRect::new(
        NSPoint::new(0.0, baseline_offset),
        image.size(),
    ));
    NSAttributedString::attributedStringWithAttachment(&attachment)
}

fn label(text: &str, mtm: MainThreadMarker) -> Retained<NSTextField> {
    let field = NSTextField::labelWithString(&NSString::from_str(text), mtm);
    field.setLineBreakMode(NSLineBreakMode::ByTruncatingTail);
    field
}

fn menu_item(
    title: &str,
    action: Option<objc2::runtime::Sel>,
    key: &str,
    mtm: MainThreadMarker,
) -> Retained<NSMenuItem> {
    unsafe {
        NSMenuItem::initWithTitle_action_keyEquivalent(
            NSMenuItem::alloc(mtm),
            &NSString::from_str(title),
            action,
            &NSString::from_str(key),
        )
    }
}

fn action_item(
    title: &str,
    action: Action,
    key: &str,
    target: &MenuTarget,
    mtm: MainThreadMarker,
) -> Retained<NSMenuItem> {
    let item = menu_item(title, Some(sel!(choose:)), key, mtm);
    unsafe { item.setTarget(Some(target)) };
    item.setTag(action as isize);
    item
}

fn disabled_item(title: &NSAttributedString, mtm: MainThreadMarker) -> Retained<NSMenuItem> {
    let item = menu_item("", None, "", mtm);
    item.setAttributedTitle(Some(title));
    item.setEnabled(false);
    item
}
