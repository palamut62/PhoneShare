//! Tailscale uzaktan erisim (PRD §48): durum sorgusu, MagicDNS adi ve HTTPS sertifikasi.
//!
//! Tailscale Windows'ta `C:\Program Files\Tailscale\tailscale.exe`'e kurulur;
//! orada yoksa PATH'te aranir. Sertifikalar `%LOCALAPPDATA%\PhoneShare\certs`
//! altinda tutulur (`tailscale cert --cert-dir`). Tailnet'te HTTPS kapaliysa
//! `fetch_cert` hata doner; cagiran bunu hata saymaz, HTTP moduna duser
//! (WireGuard zaten sifreli — PRD §48).

use std::fs;
use std::path::PathBuf;
use std::process::Stdio;

use serde::Serialize;

use crate::config::{self, DesktopConfig};
use crate::proc::command;

/// Tailscale CLI'sinin bilinen kurulum yollari. WoW64 (32-bit proses, 64-bit
/// Windows) icin `Sysnative` yolu da denenir.
fn known_paths() -> Vec<PathBuf> {
    vec![
        PathBuf::from(r"C:\Program Files\Tailscale\tailscale.exe"),
        PathBuf::from(r"C:\Program Files (x86)\Tailscale\tailscale.exe"),
        PathBuf::from(r"C:\Windows\Sysnative\Tailscale\tailscale.exe"),
    ]
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
        #[cfg(windows)]
        {
            let candidate = dir.join(format!("{name}.exe"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Tailscale CLI yolu; kurulu degilse None.
pub fn cli() -> Option<PathBuf> {
    known_paths()
        .into_iter()
        .find(|path| path.is_file())
        .or_else(|| find_on_path("tailscale"))
}

/// Paneldeki "Uzaktan Erisim" bolumunun durum goruntusu.
#[derive(Debug, Clone, Serialize)]
pub struct TailscaleStatus {
    pub installed: bool,
    pub running: bool,
    pub dns_name: Option<String>,
    pub ipv4: Option<String>,
    pub remote_enabled: bool,
}

/// `tailscale status --json` ciktisindaki TailscaleIPs listesinden ilk IPv4'u
/// bulur; IPv6 girdileri (iki nokta icerir, `fd7a:` on ekli) atlanir.
fn first_ipv4(ips: &[serde_json::Value]) -> Option<String> {
    ips.iter().find_map(|ip| {
        let ip = ip.as_str()?;
        if ip.contains(':') {
            return None; // IPv6 — atla
        }
        Some(ip.to_string())
    })
}

/// Tailscale kurulum ve baglanti durumu. `tailscale status --json` calistirilir;
/// surec basarisiz olursa hicbir alan patlamaz (calismiyor sayilir).
pub fn status(config: &DesktopConfig) -> TailscaleStatus {
    let Some(cli) = cli() else {
        return TailscaleStatus {
            installed: false,
            running: false,
            dns_name: None,
            ipv4: None,
            remote_enabled: false,
        };
    };

    let value: serde_json::Value = command(cli)
        .args(["status", "--json"])
        .stdin(Stdio::null())
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| serde_json::from_slice(&output.stdout).ok())
        .unwrap_or_default();

    let running = value
        .get("BackendState")
        .and_then(|state| state.as_str())
        .map(|state| state == "Running")
        .unwrap_or(false);

    let dns_name = value
        .get("Self")
        .and_then(|this| this.get("DNSName"))
        .and_then(|dns| dns.as_str())
        .map(|dns| dns.trim_end_matches('.').to_string());

    let ipv4 = value
        .get("Self")
        .and_then(|this| this.get("TailscaleIPs"))
        .and_then(|ips| ips.as_array())
        .and_then(|ips| first_ipv4(ips));

    // Basit yaklasim: config'te TLS aciksa uzaktan erisim etkin sayilir.
    let remote_enabled = config.receiver_tls;

    TailscaleStatus {
        installed: true,
        running,
        dns_name,
        ipv4,
        remote_enabled,
    }
}

/// Tailscale HTTPS sertifikalarinin saklandigi klasor.
pub fn cert_dir() -> PathBuf {
    config::app_data_dir().join("certs")
}

/// `tailscale cert --cert-dir <klasor> <dns>` ile sertifika alir. Tailnet'te
/// HTTPS kapaliysa hata doner; cagiran bunu hata olarak gormez, HTTP moduna duser.
pub fn fetch_cert(dns: &str) -> Result<(), String> {
    let cli = cli().ok_or_else(|| "Tailscale kurulu degil.".to_string())?;
    let dir = cert_dir();
    fs::create_dir_all(&dir).map_err(|_| "Sertifika klasoru olusturulamadi.".to_string())?;
    let output = command(cli)
        .args(["cert", "--cert-dir"])
        .arg(&dir)
        .arg(dns)
        .stdin(Stdio::null())
        .output()
        .map_err(|_| "Tailscale calistirilamadi.".to_string())?;
    if !output.status.success() {
        return Err("Sertifika alinamadi; tailnet'te HTTPS kapali olabilir.".to_string());
    }
    Ok(())
}

/// Sertifika ve anahtar yolu: `<certs>/<dns>.crt` / `<certs>/<dns>.key`.
/// `dns` son noktasi silinmis gelir (status'ta trimlenir); tailscale dosyalari
/// tam DNS adiyla yazar.
pub fn cert_paths(dns: &str) -> (PathBuf, PathBuf) {
    (
        cert_dir().join(format!("{dns}.crt")),
        cert_dir().join(format!("{dns}.key")),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cert_paths_use_full_dns_name() {
        let (cert, key) = cert_paths("umut.tail1ea60f.ts.net");
        assert_eq!(
            cert.file_name().unwrap().to_string_lossy(),
            "umut.tail1ea60f.ts.net.crt"
        );
        assert_eq!(
            key.file_name().unwrap().to_string_lossy(),
            "umut.tail1ea60f.ts.net.key"
        );
    }

    #[test]
    fn first_ipv4_skips_ipv6_entries() {
        let mixed = serde_json::json!([
            "fd7a:115c:a1e0:ab12:4843:cd39:8334:9f01",
            "100.89.62.116"
        ]);
        assert_eq!(
            first_ipv4(mixed.as_array().unwrap()),
            Some("100.89.62.116".to_string())
        );
        let only_v6 = serde_json::json!(["fd7a:115c:a1e0:ab12:4843:cd39:8334:9f01"]);
        assert_eq!(first_ipv4(only_v6.as_array().unwrap()), None);
        assert_eq!(first_ipv4(&[]), None);
    }
}
