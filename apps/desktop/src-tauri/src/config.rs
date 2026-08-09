//! Masaustu kabuk yapilandirmasi: `%LOCALAPPDATA%\PhoneShare\desktop.json`.
//!
//! Receiver'in kendi `config.json`'undan **ayridir**; burada yalnizca kabugun ihtiyaci
//! olanlar tutulur. Gercek Windows yollari yalnizca burada ve receiver'da bulunur;
//! `/api/*` yanitlarinda asla donmez (PRD §93).

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub const APP_NAME: &str = "PhoneShare";

fn default_host() -> String {
    "127.0.0.1".to_string()
}

fn default_port() -> u16 {
    8765
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DesktopConfig {
    /// Ilk kurulum sihirbazi tamamlandi mi (PRD §10).
    pub setup_completed: bool,
    /// Ana klasor (PRD §10) — varsayilan `D:\PhoneShare`.
    pub base_folder: Option<String>,
    /// Panelin "Dosyayi Ac" / "Klasorde Goster" icin kullanabilecegi izinli kokler.
    pub allowed_roots: Vec<String>,
    /// `target_id` -> gercek Windows yolu. Yalnizca yerelde tutulur.
    pub target_paths: BTreeMap<String, String>,
    /// Kabugun kendi cihaz tokeni (`POST /api/pair/confirm` ile alinir).
    pub device_token: Option<String>,
    pub device_id: Option<String>,
    #[serde(default = "default_host")]
    pub receiver_host: String,
    #[serde(default = "default_port")]
    pub receiver_port: u16,
    /// `https://` uzerinden mi konusulacak (self-signed veya Tailscale sertifikasi).
    pub receiver_tls: bool,
    /// Tailscale (veya self-signed) sertifika dosyalari; uzaktan erisim acilirken
    /// doldurulur, kapatilirken temizlenir (PRD §48).
    pub tls_certfile: Option<String>,
    pub tls_keyfile: Option<String>,
    /// Windows acilisinda otomatik baslat (PRD §7).
    pub autostart: bool,
    /// Pencere kapatilinca tepsiye insin (PRD §8).
    pub minimize_to_tray: bool,
    pub theme: String,
}

impl Default for DesktopConfig {
    fn default() -> Self {
        Self {
            setup_completed: false,
            base_folder: None,
            allowed_roots: Vec::new(),
            target_paths: BTreeMap::new(),
            device_token: None,
            device_id: None,
            receiver_host: default_host(),
            receiver_port: default_port(),
            receiver_tls: false,
            tls_certfile: None,
            tls_keyfile: None,
            autostart: false,
            minimize_to_tray: true,
            theme: "system".to_string(),
        }
    }
}

impl DesktopConfig {
    /// Panel icin taban adres. Token gibi sirlar bu deger ile birlikte donmez.
    pub fn base_url(&self) -> String {
        let scheme = if self.receiver_tls { "https" } else { "http" };
        format!("{scheme}://{}:{}", self.receiver_host, self.receiver_port)
    }

    /// TLS cert/key cifti: her ikisi de ayarliysa ve dosyalar diskte mevcutsa
    /// doner; dosya silinmis/tasinmissa None (receiver TLS'siz baslar — PRD §48
    /// HTTP dususu). Sira: (cert, key).
    pub fn tls_files(&self) -> Option<(PathBuf, PathBuf)> {
        let cert = PathBuf::from(self.tls_certfile.as_ref()?);
        let key = PathBuf::from(self.tls_keyfile.as_ref()?);
        (cert.is_file() && key.is_file()).then_some((cert, key))
    }

    /// Yol dogrulamasinda kullanilacak kok listesi: ana klasor + hedef yollari.
    pub fn effective_roots(&self) -> Vec<String> {
        let mut roots = self.allowed_roots.clone();
        if let Some(base) = &self.base_folder {
            roots.push(base.clone());
        }
        for path in self.target_paths.values() {
            roots.push(path.clone());
        }
        roots.sort();
        roots.dedup();
        roots
    }
}

pub fn app_data_dir() -> PathBuf {
    if let Ok(custom) = std::env::var("PHONESHARE_HOME") {
        if !custom.trim().is_empty() {
            return PathBuf::from(custom);
        }
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        if !local.trim().is_empty() {
            return PathBuf::from(local).join(APP_NAME);
        }
    }
    std::env::temp_dir().join(APP_NAME)
}

pub fn config_file() -> PathBuf {
    app_data_dir().join("desktop.json")
}

/// Varsayilan ana klasor: `D:\PhoneShare`; D: sürücüsü yoksa `%USERPROFILE%\PhoneShare`.
pub fn default_base_folder() -> String {
    let preferred = PathBuf::from("D:\\").join(APP_NAME);
    if PathBuf::from("D:\\").exists() {
        return preferred.to_string_lossy().to_string();
    }
    if let Ok(profile) = std::env::var("USERPROFILE") {
        if !profile.trim().is_empty() {
            return PathBuf::from(profile)
                .join(APP_NAME)
                .to_string_lossy()
                .to_string();
        }
    }
    app_data_dir().join(APP_NAME).to_string_lossy().to_string()
}

pub fn load() -> DesktopConfig {
    let file = config_file();
    match fs::read_to_string(&file) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => DesktopConfig::default(),
    }
}

pub fn save(config: &DesktopConfig) -> Result<(), String> {
    let file = config_file();
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|_| "Yapilandirma klasoru olusturulamadi.".to_string())?;
    }
    let raw = serde_json::to_string_pretty(config)
        .map_err(|_| "Yapilandirma yazilamadi.".to_string())?;
    // Once gecici dosyaya yaz, sonra yerine tasi — yarim yazilmis config olusmaz.
    let temp = file.with_extension("json.tmp");
    fs::write(&temp, raw).map_err(|_| "Yapilandirma yazilamadi.".to_string())?;
    fs::rename(&temp, &file).map_err(|_| "Yapilandirma yazilamadi.".to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_url_follows_tls_flag() {
        let mut config = DesktopConfig::default();
        assert_eq!(config.base_url(), "http://127.0.0.1:8765");
        config.receiver_tls = true;
        config.receiver_host = "umut-pc.tail1234.ts.net".to_string();
        assert_eq!(config.base_url(), "https://umut-pc.tail1234.ts.net:8765");
    }

    #[test]
    fn effective_roots_merges_base_and_targets() {
        let mut config = DesktopConfig::default();
        config.base_folder = Some("D:\\PhoneShare".to_string());
        config
            .target_paths
            .insert("belgeler".to_string(), "D:\\Belgeler".to_string());
        config
            .target_paths
            .insert("kopya".to_string(), "D:\\Belgeler".to_string());
        let roots = config.effective_roots();
        assert_eq!(roots, vec!["D:\\Belgeler", "D:\\PhoneShare"]);
    }

    #[test]
    fn config_deserializes_with_missing_fields() {
        let config: DesktopConfig = serde_json::from_str("{}").unwrap();
        assert_eq!(config.receiver_port, 8765);
        assert!(!config.setup_completed);
        assert!(config.minimize_to_tray);
        assert!(config.tls_certfile.is_none());
        assert!(config.tls_keyfile.is_none());
    }

    #[test]
    fn tls_files_requires_both_existing() {
        let mut config = DesktopConfig::default();
        assert!(config.tls_files().is_none());
        // Ayarlar dolu ama dosyalar diskte yok — None donmeli.
        config.tls_certfile = Some(r"C:\yok.crt".to_string());
        config.tls_keyfile = Some(r"C:\yok.key".to_string());
        assert!(config.tls_files().is_none());
    }
}
