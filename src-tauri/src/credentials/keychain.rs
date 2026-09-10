//! macOS Keychain access via the `security` CLI (Claude Code login).

use std::process::Command;

#[derive(serde::Serialize, Clone)]
pub(crate) struct KeychainEntry {
    account: String,
    /// Keychain modification timestamp, e.g. `20260909084709Z`.
    modified: Option<String>,
}

/// Read a generic password from the macOS Keychain.
///
/// When `account` is given the lookup is pinned to that Keychain account
/// (`security -a`); otherwise `security` returns whichever item matches the
/// service first, which is arbitrary when several exist.
pub(crate) fn read_password(service: &str, account: Option<&str>) -> Result<String, String> {
    let mut args = vec!["find-generic-password", "-s", service];
    if let Some(acct) = account {
        args.extend(["-a", acct]);
    }
    args.push("-w");
    let output = Command::new("security")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run security: {e}"))?;
    if !output.status.success() {
        return Err("Keychain item not found.".into());
    }
    String::from_utf8(output.stdout)
        .map(|s| s.trim().to_string())
        .map_err(|e| format!("Keychain output was not UTF-8: {e}"))
}

/// List Keychain accounts stored under `service`, newest first. Uses
/// `security dump-keychain` *without* `-d`, so no secrets are read; only
/// item attributes are parsed. Lets the UI offer a choice when several
/// logins share one service name.
pub(crate) fn list_accounts(service: &str) -> Result<Vec<KeychainEntry>, String> {
    let output = Command::new("security")
        .arg("dump-keychain")
        .output()
        .map_err(|e| format!("Failed to run security: {e}"))?;
    if !output.status.success() {
        return Err("Could not list Keychain items.".into());
    }
    Ok(parse_keychain_dump(
        &String::from_utf8_lossy(&output.stdout),
        service,
    ))
}

/// Pull a quoted blob value out of a `security dump-keychain` attribute line
/// such as `    "acct"<blob>="adamhiggins"`.
fn dump_blob_value(line: &str) -> Option<String> {
    let rest = line.split_once("=\"")?.1;
    Some(rest.strip_suffix('"').unwrap_or(rest).to_string())
}

/// Pull the ISO-ish timestamp out of a `"mdat"<timedate>=0x... "20260909084709Z\000"` line.
fn dump_timedate_value(line: &str) -> Option<String> {
    let rest = line.split_once("  \"")?.1;
    let end = rest.find(|c: char| !c.is_ascii_digit() && c != 'Z')?;
    let stamp = &rest[..end];
    (!stamp.is_empty()).then(|| stamp.to_string())
}

/// Parse `security dump-keychain` output (attributes only) into the accounts
/// stored under `service`, newest first.
fn parse_keychain_dump(text: &str, service: &str) -> Vec<KeychainEntry> {
    let mut entries: Vec<KeychainEntry> = Vec::new();
    let (mut acct, mut svce, mut mdat): (Option<String>, Option<String>, Option<String>) =
        (None, None, None);
    let mut flush =
        |acct: &mut Option<String>, svce: &mut Option<String>, mdat: &mut Option<String>| {
            if svce.as_deref() == Some(service) {
                if let Some(a) = acct.take().filter(|a| !a.is_empty()) {
                    if !entries.iter().any(|e| e.account == a) {
                        entries.push(KeychainEntry {
                            account: a,
                            modified: mdat.take(),
                        });
                    }
                }
            }
            *acct = None;
            *svce = None;
            *mdat = None;
        };
    for line in text.lines() {
        if line.starts_with("keychain:") {
            flush(&mut acct, &mut svce, &mut mdat);
            continue;
        }
        let t = line.trim_start();
        if t.starts_with("\"acct\"<blob>") {
            acct = dump_blob_value(t);
        } else if t.starts_with("\"svce\"<blob>") {
            svce = dump_blob_value(t);
        } else if t.starts_with("\"mdat\"<timedate>") {
            mdat = dump_timedate_value(t);
        }
    }
    flush(&mut acct, &mut svce, &mut mdat);

    entries.sort_by(|a, b| b.modified.cmp(&a.modified));
    entries
}

#[cfg(test)]
mod tests {
    use super::parse_keychain_dump;

    const DUMP: &str = r#"keychain: "/Users/me/Library/Keychains/login.keychain-db"
version: 512
class: "genp"
attributes:
    0x00000007 <blob>="Claude Code-credentials"
    "acct"<blob>="unknown"
    "cdat"<timedate>=0x32303236303930383233333132375A00  "20260908233127Z\000"
    "mdat"<timedate>=0x32303236303930383233333132375A00  "20260908233127Z\000"
    "svce"<blob>="Claude Code-credentials"
keychain: "/Users/me/Library/Keychains/login.keychain-db"
version: 512
class: "genp"
attributes:
    "acct"<blob>="other"
    "mdat"<timedate>=0x32303236303930393038343730395A00  "20260909084709Z\000"
    "svce"<blob>="Something Else"
keychain: "/Users/me/Library/Keychains/login.keychain-db"
version: 512
class: "genp"
attributes:
    "acct"<blob>="adamhiggins"
    "mdat"<timedate>=0x32303236303930393038343730395A00  "20260909084709Z\000"
    "svce"<blob>="Claude Code-credentials"
keychain: "/Users/me/Library/Keychains/login.keychain-db"
class: "genp"
attributes:
    "acct"<blob>=<NULL>
    "svce"<blob>="Claude Code-credentials"
"#;

    #[test]
    fn lists_matching_accounts_newest_first() {
        let entries = parse_keychain_dump(DUMP, "Claude Code-credentials");
        let names: Vec<&str> = entries.iter().map(|e| e.account.as_str()).collect();
        assert_eq!(names, vec!["adamhiggins", "unknown"]);
        assert_eq!(entries[0].modified.as_deref(), Some("20260909084709Z"));
        assert_eq!(entries[1].modified.as_deref(), Some("20260908233127Z"));
    }

    #[test]
    fn ignores_other_services() {
        assert!(parse_keychain_dump(DUMP, "Nope").is_empty());
    }
}
