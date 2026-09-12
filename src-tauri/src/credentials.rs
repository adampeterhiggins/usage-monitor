//! Provider credential access: files under `$HOME` and platform stores
//! (macOS Keychain, the Cursor IDE database).

pub(crate) mod cursor_ide;
pub(crate) mod keychain;

fn dirs_home() -> Option<String> {
    std::env::var("HOME").ok()
}

/// Read a file under the user's home directory (Codex auth.json, Claude credentials).
///
/// The path must be relative and stay inside `$HOME` — the frontend may legitimately
/// pass a user-configured credential path, but `..` or an absolute path would let it
/// read anywhere on disk.
pub(crate) fn read_home_file(rel_path: &str) -> Result<String, String> {
    use std::path::Component;
    let rel = std::path::Path::new(rel_path);
    let safe = !rel.is_absolute()
        && rel
            .components()
            .all(|c| matches!(c, Component::Normal(_) | Component::CurDir));
    if !safe {
        return Err("read_home_file only accepts relative paths inside the home directory.".into());
    }
    let home = dirs_home().ok_or_else(|| "Could not resolve the home directory.".to_string())?;
    let path = std::path::Path::new(&home).join(rel);
    std::fs::read_to_string(&path).map_err(|e| format!("Could not read {}: {e}", path.display()))
}
