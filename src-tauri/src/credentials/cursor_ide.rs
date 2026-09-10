//! Cursor IDE sign-in via its VS Code-shaped `state.vscdb` SQLite store.

use std::path::PathBuf;
use std::process::Command;

use super::dirs_home;

/// Cursor IDE globalStorage DB — same `ItemTable` key/value store VS Code uses.
const CURSOR_IDE_DB: &str = "Library/Application Support/Cursor/User/globalStorage/state.vscdb";

/// Keys we are willing to read from the IDE DB. The access token is only
/// returned by `access_token`; the picker uses metadata keys.
const CURSOR_IDE_KEYS: &[&str] = &[
    "cursorAuth/accessToken",
    "cursorAuth/cachedEmail",
    "cursorAuth/stripeMembershipType",
];

#[derive(serde::Serialize)]
pub(crate) struct CursorIdeLogin {
    email: Option<String>,
    membership: Option<String>,
}

fn db_path() -> Result<PathBuf, String> {
    let home = dirs_home().ok_or_else(|| "Could not resolve the home directory.".to_string())?;
    Ok(PathBuf::from(home).join(CURSOR_IDE_DB))
}

fn sqlite3_bin() -> &'static str {
    if std::path::Path::new("/usr/bin/sqlite3").exists() {
        "/usr/bin/sqlite3"
    } else {
        "sqlite3"
    }
}

/// Read one `ItemTable` value from a VS Code-shaped `state.vscdb`.
///
/// Opens read-only so a running Cursor (WAL mode) is not blocked. If that
/// fails — typically a busy WAL — fall back to an immutable URI open, which
/// can return a slightly stale token and is still enough to call the API.
fn query_item_table(path: &std::path::Path, key: &str) -> Result<Option<String>, String> {
    if !CURSOR_IDE_KEYS.contains(&key) {
        return Err("Unsupported Cursor storage key.".into());
    }
    if !path.exists() {
        return Ok(None);
    }
    let sql = format!("SELECT value FROM ItemTable WHERE key = '{key}';");
    let path_str = path.to_string_lossy().to_string();
    let bin = sqlite3_bin();

    let run = |args: &[&str]| -> Result<std::process::Output, String> {
        Command::new(bin)
            .args(args)
            .output()
            .map_err(|e| format!("Failed to run sqlite3: {e}"))
    };

    let first = run(&["-readonly", &path_str, &sql])?;
    if first.status.success() {
        let value = String::from_utf8_lossy(&first.stdout).trim().to_string();
        return Ok(if value.is_empty() { None } else { Some(value) });
    }

    // Spaces in Application Support must be percent-encoded in a file: URI.
    let encoded = path_str.replace(' ', "%20");
    let uri = format!("file:{encoded}?mode=ro&immutable=1");
    let second = run(&[&uri, &sql])?;
    if !second.status.success() {
        let err = String::from_utf8_lossy(&second.stderr).trim().to_string();
        return Err(if err.is_empty() {
            "Could not read the Cursor IDE login database.".into()
        } else {
            format!("Could not read the Cursor IDE login database: {err}")
        });
    }
    let value = String::from_utf8_lossy(&second.stdout).trim().to_string();
    Ok(if value.is_empty() { None } else { Some(value) })
}

/// Attributes for the account picker. Never returns the access token.
pub(crate) fn login_meta() -> Result<Option<CursorIdeLogin>, String> {
    let path = db_path()?;
    if query_item_table(&path, "cursorAuth/accessToken")?.is_none() {
        return Ok(None);
    }
    Ok(Some(CursorIdeLogin {
        email: query_item_table(&path, "cursorAuth/cachedEmail")?,
        membership: query_item_table(&path, "cursorAuth/stripeMembershipType")?,
    }))
}

pub(crate) fn access_token() -> Result<String, String> {
    let path = db_path()?;
    query_item_table(&path, "cursorAuth/accessToken")?
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            "Cursor IDE is not signed in on this Mac. Open Cursor and sign in, or paste a session cookie."
                .into()
        })
}

#[cfg(test)]
mod tests {
    use super::{query_item_table, sqlite3_bin};
    use std::process::Command;

    #[test]
    fn reads_item_table_value() {
        let dir =
            std::env::temp_dir().join(format!("usage-monitor-cursor-ide-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("state.vscdb");
        let sql = "CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT);\
                   INSERT INTO ItemTable VALUES ('cursorAuth/cachedEmail', 'ada@example.com');\
                   INSERT INTO ItemTable VALUES ('cursorAuth/accessToken', 'header.payload.sig');";
        let status = Command::new(sqlite3_bin())
            .args([db.to_str().unwrap(), sql])
            .status()
            .expect("sqlite3 should be available for tests");
        assert!(status.success(), "failed to create temp state.vscdb");

        assert_eq!(
            query_item_table(&db, "cursorAuth/cachedEmail")
                .unwrap()
                .as_deref(),
            Some("ada@example.com")
        );
        assert_eq!(
            query_item_table(&db, "cursorAuth/accessToken")
                .unwrap()
                .as_deref(),
            Some("header.payload.sig")
        );
        assert_eq!(
            query_item_table(&db, "cursorAuth/stripeMembershipType").unwrap(),
            None
        );
        assert!(query_item_table(&db, "not-allowed").is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
