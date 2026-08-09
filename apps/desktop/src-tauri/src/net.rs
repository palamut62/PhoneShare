//! Baglanti algilama (PRD §47, §48): LAN IP'si ve varsa Tailscale IP / MagicDNS adi.

use std::net::{IpAddr, Ipv4Addr, UdpSocket};
use std::process::Command;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct AccessAddress {
    /// `lan` | `tailscale` | `loopback`
    pub kind: String,
    pub host: String,
    pub url: String,
    /// Kullaniciya gosterilecek kisa aciklama.
    pub label: String,
    pub recommended: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct AccessInfo {
    pub addresses: Vec<AccessAddress>,
    pub tailscale_installed: bool,
    /// Tailscale kurulu ama oturum acilmamis/kapali ise doldurulur.
    pub tailscale_hint: Option<String>,
}

fn build_url(host: &str, port: u16, tls: bool) -> String {
    let scheme = if tls { "https" } else { "http" };
    // IPv6 adresleri koseli parantez ister.
    if host.contains(':') {
        format!("{scheme}://[{host}]:{port}")
    } else {
        format!("{scheme}://{host}:{port}")
    }
}

/// Tailscale CGNAT araligi: 100.64.0.0/10.
pub fn is_tailscale_ipv4(addr: &Ipv4Addr) -> bool {
    let octets = addr.octets();
    octets[0] == 100 && (64..128).contains(&octets[1])
}

/// Varsayilan rota uzerindeki yerel IPv4 adresi. Paket **gonderilmez**; yalnizca
/// isletim sisteminin sececegi kaynak adres ogrenilir.
pub fn primary_lan_ipv4() -> Option<Ipv4Addr> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    match socket.local_addr().ok()?.ip() {
        IpAddr::V4(addr) if !addr.is_loopback() && !addr.is_unspecified() => Some(addr),
        _ => None,
    }
}

fn run_tailscale(args: &[&str]) -> Option<String> {
    let output = Command::new("tailscale").args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// `tailscale status --json` ciktisindan bu makinenin IP'si ve MagicDNS adi.
pub fn parse_tailscale_status(raw: &str) -> (Option<String>, Option<String>) {
    let value: serde_json::Value = match serde_json::from_str(raw) {
        Ok(value) => value,
        Err(_) => return (None, None),
    };
    let self_node = &value["Self"];
    let ip = self_node["TailscaleIPs"]
        .as_array()
        .and_then(|items| items.iter().find_map(|item| item.as_str()))
        .map(str::to_string);
    let dns = self_node["DNSName"]
        .as_str()
        .map(|name| name.trim_end_matches('.').to_string())
        .filter(|name| !name.is_empty());
    (ip, dns)
}

pub fn collect(port: u16, tls: bool) -> AccessInfo {
    let mut addresses = Vec::new();

    let status_raw = run_tailscale(&["status", "--json"]);
    let tailscale_installed = status_raw.is_some()
        || Command::new("tailscale")
            .arg("version")
            .output()
            .map(|out| out.status.success())
            .unwrap_or(false);

    let (ts_ip, ts_dns) = status_raw
        .as_deref()
        .map(parse_tailscale_status)
        .unwrap_or((None, None));

    // PRD §48 — Tailscale onerilen yontemdir; listede once gelir.
    if let Some(dns) = ts_dns.clone() {
        addresses.push(AccessAddress {
            kind: "tailscale".to_string(),
            host: dns.clone(),
            url: build_url(&dns, port, tls),
            label: "Tailscale (MagicDNS) — onerilen".to_string(),
            recommended: true,
        });
    }
    if let Some(ip) = ts_ip.clone() {
        addresses.push(AccessAddress {
            kind: "tailscale".to_string(),
            host: ip.clone(),
            url: build_url(&ip, port, tls),
            label: "Tailscale IP — onerilen".to_string(),
            recommended: true,
        });
    }

    if let Some(lan) = primary_lan_ipv4() {
        if !is_tailscale_ipv4(&lan) {
            let host = lan.to_string();
            addresses.push(AccessAddress {
                kind: "lan".to_string(),
                host: host.clone(),
                url: build_url(&host, port, tls),
                label: "Yerel ag (ayni Wi-Fi)".to_string(),
                recommended: false,
            });
        }
    }

    addresses.push(AccessAddress {
        kind: "loopback".to_string(),
        host: "127.0.0.1".to_string(),
        url: build_url("127.0.0.1", port, tls),
        label: "Yalnizca bu bilgisayar".to_string(),
        recommended: false,
    });

    let tailscale_hint = if tailscale_installed && ts_ip.is_none() {
        Some("Tailscale kurulu ancak baglanti yok. Tailscale uygulamasindan oturum acin.".to_string())
    } else if !tailscale_installed {
        Some(
            "Uzaktan erisim icin Tailscale onerilir. Portu internete acmayin (PRD §48)."
                .to_string(),
        )
    } else {
        None
    };

    AccessInfo {
        addresses,
        tailscale_installed,
        tailscale_hint,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tailscale_range_is_detected() {
        assert!(is_tailscale_ipv4(&Ipv4Addr::new(100, 101, 5, 9)));
        assert!(!is_tailscale_ipv4(&Ipv4Addr::new(192, 168, 1, 20)));
        assert!(!is_tailscale_ipv4(&Ipv4Addr::new(100, 200, 1, 1)));
    }

    #[test]
    fn url_builder_handles_ipv6_and_tls() {
        assert_eq!(build_url("192.168.1.20", 8765, false), "http://192.168.1.20:8765");
        assert_eq!(build_url("fe80::1", 8765, false), "http://[fe80::1]:8765");
        assert_eq!(build_url("pc.ts.net", 8765, true), "https://pc.ts.net:8765");
    }

    #[test]
    fn tailscale_status_json_is_parsed() {
        let raw = r#"{"Self":{"TailscaleIPs":["100.101.5.9","fd7a::1"],"DNSName":"umut-pc.tail1234.ts.net."}}"#;
        let (ip, dns) = parse_tailscale_status(raw);
        assert_eq!(ip.as_deref(), Some("100.101.5.9"));
        assert_eq!(dns.as_deref(), Some("umut-pc.tail1234.ts.net"));
    }

    #[test]
    fn broken_tailscale_status_is_tolerated() {
        assert_eq!(parse_tailscale_status("not json"), (None, None));
        assert_eq!(parse_tailscale_status("{}"), (None, None));
    }
}
