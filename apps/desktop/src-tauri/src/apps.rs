//! PC'de kurulu uygulamalarin listelenmesi (PRD: Apps karti).
//!
//! Uc kaynak birlestirilir: registry `App Paths`, registry `Uninstall` kayitlari ve
//! Baslat Menusu kisayollari (`.lnk`). Sonuc yalnizca kabuk uzerinden calistirilabilir
//! adaylari icerir; calisamayacak girdiler (yolu bulunamayan) atlanir.

use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct InstalledApp {
    pub id: String,
    pub name: String,
    pub path: String,
    pub kind: String,
}

/// `DisplayIcon` degerinden `,0` gibi index ekini ve tirnaklari temizler.
pub fn clean_display_icon(raw: &str) -> String {
    let trimmed = raw.trim().trim_matches('"');
    match trimmed.rfind(".exe") {
        Some(idx) => trimmed[..idx + 4].trim_matches('"').to_string(),
        None => trimmed.to_string(),
    }
}

/// `DisplayName` sonundaki surum ekini atar: "Aesir Launcher 5.0.0 surumu" -> "Aesir Launcher".
/// Ilk "rakamla baslayan ve nokta iceren" kelimeden itibarasi kesilir; boyle bir kelime
/// yoksa isim aynen kalir.
pub fn strip_version_suffix(name: &str) -> String {
    let mut kept: Vec<&str> = Vec::new();
    for word in name.split_whitespace() {
        let is_version = word.starts_with(|c: char| c.is_ascii_digit()) && word.contains('.');
        if is_version && !kept.is_empty() {
            break;
        }
        kept.push(word);
    }
    kept.join(" ")
}

/// Kisayol adinin "gurultu" (kaldirma/yardim/web sitesi) olup olmadigi.
pub fn is_noise_shortcut(name: &str) -> bool {
    let lower = name.to_lowercase();
    const NOISE: [&str; 7] = ["uninstall", "kaldır", "kaldir", "readme", "help", "website", "web site"];
    NOISE.iter().any(|needle| lower.contains(needle))
}

#[cfg(windows)]
mod platform {
    use super::{clean_display_icon, is_noise_shortcut, InstalledApp};
    use std::collections::HashMap;
    use std::path::{Path, PathBuf};
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    const APP_PATHS_KEY: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths";
    const UNINSTALL_KEY: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
    const WOW64_APP_PATHS_KEY: &str =
        r"SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\App Paths";
    const WOW64_UNINSTALL_KEY: &str =
        r"SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall";

    /// Oncelik: dusuk sayi = yuksek oncelik (App Paths > Uninstall > shortcut).
    struct Candidate {
        name: String,
        path: String,
        kind: &'static str,
        priority: u8,
    }

    fn collect_app_paths(hive: isize, subkey: &str, out: &mut HashMap<String, Candidate>) {
        let root = RegKey::predef(hive);
        let Ok(key) = root.open_subkey_with_flags(subkey, KEY_READ) else {
            return;
        };
        for name in key.enum_keys().filter_map(Result::ok) {
            let Ok(sub) = key.open_subkey_with_flags(&name, KEY_READ) else {
                continue;
            };
            let Ok(path) = sub.get_value::<String, _>("") else {
                continue;
            };
            let cleaned = clean_display_icon(&path);
            if !cleaned.to_lowercase().ends_with(".exe") || !Path::new(&cleaned).is_file() {
                continue;
            }
            let display_name = name.trim_end_matches(".exe").to_string();
            let id = cleaned.to_lowercase();
            let candidate = Candidate {
                name: display_name,
                path: cleaned,
                kind: "exe",
                priority: 0,
            };
            insert_if_better(out, id, candidate);
        }
    }

    fn collect_uninstall(hive: isize, subkey: &str, out: &mut HashMap<String, Candidate>) {
        let root = RegKey::predef(hive);
        let Ok(key) = root.open_subkey_with_flags(subkey, KEY_READ) else {
            return;
        };
        for name in key.enum_keys().filter_map(Result::ok) {
            let Ok(sub) = key.open_subkey_with_flags(&name, KEY_READ) else {
                continue;
            };
            let display_name: String = match sub.get_value("DisplayName") {
                Ok(value) => value,
                Err(_) => continue,
            };
            if display_name.trim().is_empty() {
                continue;
            }
            let system_component: u32 = sub.get_value("SystemComponent").unwrap_or(0);
            if system_component == 1 {
                continue;
            }
            let icon: String = match sub.get_value("DisplayIcon") {
                Ok(value) => value,
                Err(_) => continue,
            };
            let cleaned = clean_display_icon(&icon);
            if !cleaned.to_lowercase().ends_with(".exe") || !Path::new(&cleaned).is_file() {
                // Yolu yoksa calistirilamaz — atlanir.
                continue;
            }
            let id = cleaned.to_lowercase();
            let candidate = Candidate {
                name: super::strip_version_suffix(display_name.trim()),
                path: cleaned,
                kind: "exe",
                priority: 1,
            };
            insert_if_better(out, id, candidate);
        }
    }

    fn insert_if_better(map: &mut HashMap<String, Candidate>, id: String, candidate: Candidate) {
        match map.get(&id) {
            Some(existing) if existing.priority <= candidate.priority => {}
            _ => {
                map.insert(id, candidate);
            }
        }
    }

    fn collect_shortcuts(dir: &Path, depth: u8, out: &mut HashMap<String, Candidate>) {
        if depth > 4 {
            return;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path.is_dir() {
                collect_shortcuts(&path, depth + 1, out);
                continue;
            }
            let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
                continue;
            };
            if !ext.eq_ignore_ascii_case("lnk") {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            if is_noise_shortcut(stem) {
                continue;
            }
            let id = path.to_string_lossy().to_lowercase();
            let candidate = Candidate {
                name: stem.to_string(),
                path: path.to_string_lossy().to_string(),
                kind: "shortcut",
                priority: 2,
            };
            insert_if_better(out, id, candidate);
        }
    }

    pub fn list_installed() -> Vec<InstalledApp> {
        let mut map: HashMap<String, Candidate> = HashMap::new();

        collect_app_paths(HKEY_LOCAL_MACHINE, APP_PATHS_KEY, &mut map);
        collect_app_paths(HKEY_LOCAL_MACHINE, WOW64_APP_PATHS_KEY, &mut map);
        collect_app_paths(HKEY_CURRENT_USER, APP_PATHS_KEY, &mut map);

        collect_uninstall(HKEY_LOCAL_MACHINE, UNINSTALL_KEY, &mut map);
        collect_uninstall(HKEY_LOCAL_MACHINE, WOW64_UNINSTALL_KEY, &mut map);
        collect_uninstall(HKEY_CURRENT_USER, UNINSTALL_KEY, &mut map);

        let mut shortcut_dirs: Vec<PathBuf> = Vec::new();
        if let Ok(program_data) = std::env::var("ProgramData") {
            shortcut_dirs.push(
                PathBuf::from(program_data).join("Microsoft\\Windows\\Start Menu\\Programs"),
            );
        }
        if let Ok(appdata) = std::env::var("APPDATA") {
            shortcut_dirs
                .push(PathBuf::from(appdata).join("Microsoft\\Windows\\Start Menu\\Programs"));
        }
        for dir in &shortcut_dirs {
            collect_shortcuts(dir, 0, &mut map);
        }

        // Ayni uygulama hem kisayol hem exe olarak gelebilir (ornegin "Antigravity").
        // Kullaniciya tek satir gosterilir; kisayol tercih edilir cunku adi ve
        // baslatma davranisi kullanicinin Baslat Menusunde gordugu ile aynidir.
        let mut by_name: HashMap<String, Candidate> = HashMap::new();
        for (_, candidate) in map {
            let key = candidate.name.to_lowercase();
            let better = match by_name.get(&key) {
                Some(existing) => existing.kind != "shortcut" && candidate.kind == "shortcut",
                None => true,
            };
            if better {
                by_name.insert(key, candidate);
            }
        }

        let mut apps: Vec<InstalledApp> = by_name
            .into_values()
            .map(|candidate| InstalledApp {
                id: candidate.path.to_lowercase(),
                name: candidate.name,
                path: candidate.path,
                kind: candidate.kind.to_string(),
            })
            .collect();

        apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        apps.truncate(2000);
        apps
    }
}

#[cfg(not(windows))]
mod platform {
    use super::InstalledApp;

    pub fn list_installed() -> Vec<InstalledApp> {
        Vec::new()
    }
}

pub fn list_installed() -> Vec<InstalledApp> {
    platform::list_installed()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_display_icon_strips_index_suffix() {
        assert_eq!(
            clean_display_icon(r#""C:\a\b.exe",0"#),
            r"C:\a\b.exe"
        );
    }

    #[test]
    fn clean_display_icon_handles_plain_path() {
        assert_eq!(clean_display_icon(r"C:\a\b.exe"), r"C:\a\b.exe");
    }

    #[test]
    fn strip_version_suffix_removes_trailing_version() {
        assert_eq!(strip_version_suffix("Aesir Launcher 5.0.0 surumu"), "Aesir Launcher");
        assert_eq!(strip_version_suffix("Antigravity 2.6.0"), "Antigravity");
        assert_eq!(strip_version_suffix("7-Zip"), "7-Zip");
        // Isim tamamen surum gibi gorunse bile bos donmez.
        assert_eq!(strip_version_suffix("1.2.3"), "1.2.3");
    }

    #[test]
    fn is_noise_shortcut_filters_uninstall_entries() {
        assert!(is_noise_shortcut("Uninstall MyApp"));
        assert!(is_noise_shortcut("MyApp Kaldır"));
        assert!(is_noise_shortcut("Readme"));
        assert!(is_noise_shortcut("Website"));
        assert!(!is_noise_shortcut("MyApp"));
    }
}
