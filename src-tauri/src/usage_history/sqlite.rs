//! Read-only queries through the system `sqlite3` binary, which keeps the
//! SQLite-backed sources (Devin, OpenCode, Antigravity) free of a bundled
//! SQLite build.

use std::path::Path;
use std::process::Command;

fn sqlite3_bin() -> &'static str {
    if Path::new("/usr/bin/sqlite3").exists() {
        "/usr/bin/sqlite3"
    } else {
        "sqlite3"
    }
}

/// Runs `sql` against `db` and returns its tab-separated output, or `None`
/// when `sqlite3` could not run or reported an error. A busy writer gets two
/// seconds before the read gives up.
pub(super) fn query(db: &Path, sql: &str) -> Option<String> {
    let output = Command::new(sqlite3_bin())
        .args(["-readonly", "-batch", "-noheader", "-separator", "\t", "-cmd", ".timeout 2000"])
        .arg(db)
        .arg(sql)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}
