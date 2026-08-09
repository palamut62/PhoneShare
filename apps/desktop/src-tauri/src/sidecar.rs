//! Python receiver'i sidecar olarak yonetir (PRD §9).
//!
//! - Uretim: uygulama exe'sinin yaninda duran `phoneshare-receiver.exe` (PyInstaller).
//! - Gelistirme: `python -m phoneshare_receiver run` (repo icindeki `receiver/` paketi).
//!
//! stdout/stderr satirlari halka tamponunda tutulur ve `receiver-log` olayiyla panele
//! akitilir. Uygulama kapanirken cocuk surec mutlaka oldurulur (zombi surec birakilmaz).

use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Panelde gosterilecek en fazla log satiri.
const LOG_CAPACITY: usize = 500;

#[derive(Debug, Clone, Serialize)]
pub struct LogLine {
    pub stream: String,
    pub line: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SidecarStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub mode: String,
    pub host: String,
    pub port: u16,
}

#[derive(Default)]
pub struct Sidecar {
    child: Mutex<Option<Child>>,
    logs: Arc<Mutex<VecDeque<LogLine>>>,
    mode: Mutex<String>,
}

fn push_log(buffer: &Arc<Mutex<VecDeque<LogLine>>>, app: &AppHandle, stream: &str, line: String) {
    let entry = LogLine {
        stream: stream.to_string(),
        line,
    };
    if let Ok(mut logs) = buffer.lock() {
        if logs.len() >= LOG_CAPACITY {
            logs.pop_front();
        }
        logs.push_back(entry.clone());
    }
    let _ = app.emit("receiver-log", entry);
}

#[cfg(windows)]
fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    // CREATE_NO_WINDOW — sidecar icin konsol penceresi acilmasin.
    command.creation_flags(0x0800_0000);
}

#[cfg(not(windows))]
fn hide_console(_command: &mut Command) {}

/// Uretimdeki sidecar exe'si: uygulama calistirilabilirinin yanindadir.
fn bundled_receiver() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let candidate = dir.join("phoneshare-receiver.exe");
    if candidate.exists() {
        return Some(candidate);
    }
    let candidate = dir.join("phoneshare-receiver");
    candidate.exists().then_some(candidate)
}

/// Gelistirme modunda repo icindeki `receiver/` dizinini bulur (`src-tauri`'den 3 ust).
fn dev_receiver_dir() -> Option<PathBuf> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest.parent()?.parent()?.parent()?;
    let receiver = repo_root.join("receiver");
    receiver.join("src").exists().then_some(receiver)
}

/// Gelistirme modunda `apps/web/out` PWA ciktisini bulur (`src-tauri`'den 2 ust;
/// tauri.conf.json `resources` girisindeki `../../web/out` ile ayni yol).
/// Uretimde web dizini `resource_dir/web`'den gelir.
fn dev_web_dist() -> Option<PathBuf> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let apps_dir = manifest.parent()?.parent()?;
    let out = apps_dir.join("web").join("out");
    out.join("index.html").exists().then_some(out)
}

impl Sidecar {
    pub fn logs(&self) -> Vec<LogLine> {
        self.logs
            .lock()
            .map(|logs| logs.iter().cloned().collect())
            .unwrap_or_default()
    }

    pub fn clear_logs(&self) {
        if let Ok(mut logs) = self.logs.lock() {
            logs.clear();
        }
    }

    pub fn is_running(&self) -> bool {
        let mut guard = match self.child.lock() {
            Ok(guard) => guard,
            Err(_) => return false,
        };
        match guard.as_mut() {
            Some(child) => match child.try_wait() {
                Ok(Some(_)) => {
                    *guard = None;
                    false
                }
                Ok(None) => true,
                Err(_) => false,
            },
            None => false,
        }
    }

    pub fn status(&self, host: &str, port: u16) -> SidecarStatus {
        let running = self.is_running();
        let pid = self
            .child
            .lock()
            .ok()
            .and_then(|guard| guard.as_ref().map(|child| child.id()));
        SidecarStatus {
            running,
            pid: if running { pid } else { None },
            mode: self
                .mode
                .lock()
                .map(|mode| mode.clone())
                .unwrap_or_else(|_| "unknown".to_string()),
            host: host.to_string(),
            port,
        }
    }

    /// Receiver'i baslatir. Zaten calisiyorsa sessizce basarili doner (idempotent).
    ///
    /// `web_dist`, receiver'a `--web-dist` olarak verilen PWA static ciktisidir
    /// (PRD §11-14): uretimde `resource_dir/web`; gelistirmede yoksa repo ici
    /// `web/out` denenir. Hicbiri yoksa receiver yine baslar, yalnizca web
    /// panelini servis etmez (arguman opsiyoneldir).
    ///
    /// `tls` (cert, key) verilirse receiver `--tls-certfile` / `--tls-keyfile`
    /// ile HTTPS'te dinler; None ise düz HTTP (PRD §48 uzaktan erisim).
    pub fn start(
        &self,
        app: &AppHandle,
        host: &str,
        port: u16,
        web_dist: Option<PathBuf>,
        tls: Option<(PathBuf, PathBuf)>,
    ) -> Result<(), String> {
        if self.is_running() {
            return Ok(());
        }

        let (mut command, mode) = match bundled_receiver() {
            Some(exe) => {
                let mut command = Command::new(exe);
                command.arg("run");
                (command, "bundled".to_string())
            }
            None => {
                let receiver_dir =
                    dev_receiver_dir().ok_or_else(|| "Receiver bulunamadi.".to_string())?;
                let python = std::env::var("PHONESHARE_PYTHON").unwrap_or_else(|_| {
                    let venv = receiver_dir.join(".venv").join("Scripts").join("python.exe");
                    if venv.exists() {
                        venv.to_string_lossy().to_string()
                    } else {
                        "python".to_string()
                    }
                });
                let mut command = Command::new(python);
                command
                    .args(["-m", "phoneshare_receiver", "run"])
                    .current_dir(&receiver_dir)
                    .env("PYTHONUNBUFFERED", "1")
                    .env("PYTHONPATH", receiver_dir.join("src"));
                (command, "dev".to_string())
            }
        };

        command
            .args(["--host", host])
            .args(["--port", &port.to_string()])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());
        hide_console(&mut command);

        // PWA static ciktisi (PRD §14): iPhone'un eristigi web paneli. Verilen
        // dizin yoksa (dev'de `resource_dir` bos) repo ici `web/out`'a dusulur;
        // o da yoksa arguman gecilmez ve receiver yine baslar.
        let web_dist = web_dist
            .filter(|path| path.exists())
            .or_else(dev_web_dist);
        if let Some(dist) = web_dist {
            command.arg("--web-dist").arg(dist);
        }

        // TLS (cert, key) verildiyse HTTPS'te dinle (PRD §48). Dev modunda da
        // calisir — self-signed sertifikalarla test edilebilir.
        if let Some((cert, key)) = &tls {
            let cert_arg = cert.to_string_lossy();
            let key_arg = key.to_string_lossy();
            command.args(["--tls-certfile", cert_arg.as_ref()]);
            command.args(["--tls-keyfile", key_arg.as_ref()]);
        }

        let mut child = command
            .spawn()
            .map_err(|_| "Receiver baslatilamadi. Kurulumu kontrol edin.".to_string())?;

        if let Some(stdout) = child.stdout.take() {
            self.spawn_reader(app.clone(), stdout, "stdout");
        }
        if let Some(stderr) = child.stderr.take() {
            self.spawn_reader(app.clone(), stderr, "stderr");
        }

        if let Ok(mut slot) = self.mode.lock() {
            *slot = mode;
        }
        if let Ok(mut slot) = self.child.lock() {
            *slot = Some(child);
        }
        push_log(
            &self.logs,
            app,
            "system",
            format!("Receiver baslatildi ({host}:{port})."),
        );
        Ok(())
    }

    fn spawn_reader<R: std::io::Read + Send + 'static>(
        &self,
        app: AppHandle,
        reader: R,
        stream: &'static str,
    ) {
        let buffer = Arc::clone(&self.logs);
        std::thread::spawn(move || {
            let reader = BufReader::new(reader);
            for line in reader.lines() {
                match line {
                    Ok(line) => push_log(&buffer, &app, stream, line),
                    Err(_) => break,
                }
            }
        });
    }

    /// Receiver'i durdurur. Calismiyorsa hata vermez.
    pub fn stop(&self) -> Result<(), String> {
        let mut guard = self
            .child
            .lock()
            .map_err(|_| "Receiver durumu okunamadi.".to_string())?;
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_buffer_is_bounded() {
        let buffer: VecDeque<LogLine> = VecDeque::new();
        let mut buffer = buffer;
        for index in 0..(LOG_CAPACITY + 50) {
            if buffer.len() >= LOG_CAPACITY {
                buffer.pop_front();
            }
            buffer.push_back(LogLine {
                stream: "stdout".to_string(),
                line: format!("satir {index}"),
            });
        }
        assert_eq!(buffer.len(), LOG_CAPACITY);
        assert_eq!(buffer.back().unwrap().line, format!("satir {}", LOG_CAPACITY + 49));
    }
}
