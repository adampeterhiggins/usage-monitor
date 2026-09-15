//! Loopback listener for provider sign-in redirects.
//!
//! Providers whose CLI uses an OAuth loopback redirect (Devin) send the
//! authorization code to `http://127.0.0.1:<port>/callback`. The frontend
//! binds a port first so it can put the real port in `redirect_uri`, opens the
//! browser, then waits for the one request.
//!
//! Deliberately narrow: loopback only, one code per bound port, a hard
//! timeout, and nothing is ever read from the request beyond its query string.

use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// A bound listener plus the path prefix it treats as its callback — Codex
/// waits on `/auth/callback`, most providers on `/callback`.
struct PendingListener {
    listener: TcpListener,
    callback_path: String,
}

/// Ports bound by `listen` and not yet consumed by `wait`.
fn pending() -> &'static Mutex<HashMap<u16, PendingListener>> {
    static PENDING: OnceLock<Mutex<HashMap<u16, PendingListener>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Ports whose wait was cancelled while it was already blocking.
fn cancelled() -> &'static Mutex<HashSet<u16>> {
    static CANCELLED: OnceLock<Mutex<HashSet<u16>>> = OnceLock::new();
    CANCELLED.get_or_init(|| Mutex::new(HashSet::new()))
}

const POLL_INTERVAL: Duration = Duration::from_millis(120);
const READ_TIMEOUT: Duration = Duration::from_secs(5);
const RESPONSE: &str = "\
You can close this window and return to Usage Monitor.";

/// Bind a loopback port, trying `ports` in order (0 = any free port).
/// Returns the port to put in `redirect_uri`.
pub(crate) fn listen(ports: &[u16], callback_path: &str) -> Result<u16, String> {
    let mut last_err = String::from("no ports offered");
    for &port in ports {
        let listener = match TcpListener::bind((Ipv4Addr::LOCALHOST, port)) {
            Ok(listener) => listener,
            Err(e) => {
                last_err = e.to_string();
                continue;
            }
        };
        let port = listener
            .local_addr()
            .map_err(|e| format!("Could not read the local sign-in port: {e}"))?
            .port();
        listener
            .set_nonblocking(true)
            .map_err(|e| format!("Could not prepare the local sign-in port: {e}"))?;
        pending()
            .lock()
            .map_err(|_| "Sign-in listener state is poisoned.".to_string())?
            .insert(
                port,
                PendingListener {
                    listener,
                    callback_path: callback_path.to_string(),
                },
            );
        return Ok(port);
    }
    Err(format!(
        "Could not open a local port for sign-in: {last_err}"
    ))
}

/// Drop a bound port without waiting — used when sign-in is cancelled.
pub(crate) fn cancel(port: u16) {
    if let Ok(mut map) = pending().lock() {
        map.remove(&port);
    }
    // `wait` already owns the listener once it starts, so signal it too.
    if let Ok(mut set) = cancelled().lock() {
        set.insert(port);
    }
}

fn reply(stream: &mut TcpStream, status: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

/// The query string of the first request to the bound callback path.
///
/// Anything else (a browser's `/favicon.ico`, a stray probe) is answered 404
/// and ignored, so one noisy request cannot consume the sign-in.
pub(crate) fn wait(port: u16, timeout_secs: u64) -> Result<String, String> {
    let PendingListener {
        listener,
        callback_path,
    } = pending()
        .lock()
        .map_err(|_| "Sign-in listener state is poisoned.".to_string())?
        .remove(&port)
        .ok_or_else(|| format!("No sign-in listener is bound to port {port}."))?;

    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    loop {
        if Instant::now() >= deadline {
            return Err("Timed out waiting for the browser to finish sign-in.".into());
        }
        if cancelled().lock().is_ok_and(|mut set| set.remove(&port)) {
            return Err("Sign-in was cancelled.".into());
        }
        let (mut stream, peer) = match listener.accept() {
            Ok(accepted) => accepted,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(POLL_INTERVAL);
                continue;
            }
            Err(e) => return Err(format!("Local sign-in listener failed: {e}")),
        };
        // Only this machine may deliver the code.
        if !peer.ip().is_loopback() {
            continue;
        }
        let _ = stream.set_read_timeout(Some(READ_TIMEOUT));
        let _ = stream.set_nonblocking(false);

        let mut request_line = String::new();
        if BufReader::new(&stream)
            .read_line(&mut request_line)
            .is_err()
        {
            continue;
        }
        // `GET /callback?code=…&state=… HTTP/1.1`
        let target = request_line.split_whitespace().nth(1).unwrap_or("");
        let (path, query) = match target.split_once('?') {
            Some((path, query)) => (path, query),
            None => (target, ""),
        };
        if !path.starts_with(&callback_path) {
            reply(&mut stream, "404 Not Found", "Not found.");
            continue;
        }
        reply(&mut stream, "200 OK", RESPONSE);
        return Ok(query.to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    /// Drive one browser-shaped request against a bound port.
    fn get(port: u16, target: &str) -> String {
        let mut stream = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).expect("connect");
        write!(stream, "GET {target} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").expect("write");
        let mut response = String::new();
        let _ = stream.read_to_string(&mut response);
        response
    }

    #[test]
    fn delivers_the_callback_query() {
        let port = listen(&[0], "/callback").expect("bind");
        let client = std::thread::spawn(move || get(port, "/callback?code=abc&state=xyz"));
        let query = wait(port, 10).expect("wait");
        assert_eq!(query, "code=abc&state=xyz");
        assert!(client.join().expect("join").starts_with("HTTP/1.1 200 OK"));
    }

    #[test]
    fn ignores_other_paths_and_keeps_waiting() {
        let port = listen(&[0], "/callback").expect("bind");
        let client = std::thread::spawn(move || {
            // A browser asking for a favicon must not consume the sign-in.
            assert!(get(port, "/favicon.ico").starts_with("HTTP/1.1 404"));
            get(port, "/callback?code=real")
        });
        assert_eq!(wait(port, 10).expect("wait"), "code=real");
        client.join().expect("join");
    }

    #[test]
    fn reports_an_error_callback_verbatim() {
        let port = listen(&[0], "/callback").expect("bind");
        std::thread::spawn(move || get(port, "/callback?error=access_denied"));
        assert_eq!(wait(port, 10).expect("wait"), "error=access_denied");
    }

    #[test]
    fn cancel_before_wait_releases_the_port() {
        let port = listen(&[0], "/callback").expect("bind");
        cancel(port);
        assert!(wait(port, 1).is_err());
    }

    #[test]
    fn cancel_interrupts_a_running_wait() {
        let port = listen(&[0], "/callback").expect("bind");
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(200));
            cancel(port);
        });
        let err = wait(port, 30).expect_err("cancelled");
        assert!(err.contains("cancelled"), "{err}");
    }

    #[test]
    fn times_out_without_a_callback() {
        let port = listen(&[0], "/callback").expect("bind");
        let err = wait(port, 1).expect_err("timeout");
        assert!(err.contains("Timed out"), "{err}");
    }

    #[test]
    fn honors_a_custom_callback_path() {
        let port = listen(&[0], "/auth/callback").expect("bind");
        let client = std::thread::spawn(move || {
            assert!(get(port, "/callback?code=wrong-path").starts_with("HTTP/1.1 404"));
            get(port, "/auth/callback?code=abc")
        });
        assert_eq!(wait(port, 10).expect("wait"), "code=abc");
        client.join().expect("join");
    }

    #[test]
    fn falls_back_when_a_preferred_port_is_taken() {
        let blocker = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).expect("bind");
        let taken = blocker.local_addr().expect("addr").port();
        let port = listen(&[taken, 0], "/callback").expect("bind");
        assert_ne!(port, taken);
        cancel(port);
    }
}
