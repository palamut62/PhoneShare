//! Windows acilisinda otomatik baslatma (PRD §7).
//!
//! **Yontem: `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run`.**
//!
//! Gerekce: HKCU altindaki `Run` anahtari **yonetici yetkisi gerektirmez**; kullanici
//! oturum acinca calisir ve kaldirmasi tek bir kayit degeri silmekten ibarettir.
//! Task Scheduler `HIGHEST` haklarla gorev olusturmak icin yukseltme ister ve kaldirma
//! isini karmasiklastirir; HKLM ise makine geneli oldugu icin yine yonetici gerektirir.
//! Bu yuzden HKCU\Run tercih edildi.

pub const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
pub const VALUE_NAME: &str = "PhoneShare";

/// Registry'ye yazilacak komut satirini uretir.
///
/// Yol bosluk icerebilecegi icin daima tirnak icine alinir. `--minimized` bayragi ile
/// uygulama acilista dogrudan tepsiye iner (pencere acilmaz).
pub fn autostart_command(exe_path: &str) -> String {
    let cleaned = exe_path.trim().trim_matches('"');
    format!("\"{cleaned}\" --minimized")
}

/// Registry degerinin bizim urettigimiz komutla ayni exe'yi gosterip gostermedigi.
pub fn command_matches(existing: &str, exe_path: &str) -> bool {
    let expected = autostart_command(exe_path);
    existing.trim().eq_ignore_ascii_case(expected.trim())
}

pub fn current_exe_path() -> Result<String, String> {
    std::env::current_exe()
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|_| "Uygulama yolu belirlenemedi.".to_string())
}

#[cfg(windows)]
mod platform {
    use super::{RUN_KEY, VALUE_NAME};
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
    use winreg::RegKey;

    fn open(write: bool) -> Result<RegKey, String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let access = if write { KEY_READ | KEY_WRITE } else { KEY_READ };
        hkcu.open_subkey_with_flags(RUN_KEY, access)
            .or_else(|_| hkcu.create_subkey(RUN_KEY).map(|(key, _)| key))
            .map_err(|_| "Otomatik baslatma ayari acilamadi.".to_string())
    }

    pub fn read_value() -> Option<String> {
        open(false).ok().and_then(|key| key.get_value(VALUE_NAME).ok())
    }

    pub fn write_value(command: &str) -> Result<(), String> {
        open(true)?
            .set_value(VALUE_NAME, &command.to_string())
            .map_err(|_| "Otomatik baslatma acilamadi.".to_string())
    }

    pub fn delete_value() -> Result<(), String> {
        let key = open(true)?;
        match key.delete_value(VALUE_NAME) {
            Ok(()) => Ok(()),
            // Zaten yoksa bu bir hata degildir.
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err("Otomatik baslatma kapatilamadi.".to_string()),
        }
    }
}

#[cfg(not(windows))]
mod platform {
    pub fn read_value() -> Option<String> {
        None
    }
    pub fn write_value(_command: &str) -> Result<(), String> {
        Err("Otomatik baslatma yalnizca Windows'ta desteklenir.".to_string())
    }
    pub fn delete_value() -> Result<(), String> {
        Ok(())
    }
}

pub fn is_enabled() -> bool {
    match (platform::read_value(), current_exe_path()) {
        (Some(existing), Ok(exe)) => command_matches(&existing, &exe),
        (Some(_), Err(_)) => true,
        _ => false,
    }
}

pub fn set_enabled(enabled: bool) -> Result<(), String> {
    if enabled {
        let exe = current_exe_path()?;
        platform::write_value(&autostart_command(&exe))
    } else {
        platform::delete_value()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_is_quoted_and_minimized() {
        assert_eq!(
            autostart_command(r"C:\Program Files\PhoneShare\PhoneShare.exe"),
            "\"C:\\Program Files\\PhoneShare\\PhoneShare.exe\" --minimized"
        );
    }

    #[test]
    fn command_does_not_double_quote() {
        assert_eq!(
            autostart_command("\"C:\\PhoneShare\\PhoneShare.exe\""),
            "\"C:\\PhoneShare\\PhoneShare.exe\" --minimized"
        );
    }

    #[test]
    fn run_key_is_the_per_user_hive_path() {
        assert_eq!(RUN_KEY, r"Software\Microsoft\Windows\CurrentVersion\Run");
        assert_eq!(VALUE_NAME, "PhoneShare");
    }

    #[test]
    fn command_matches_is_case_insensitive() {
        let exe = r"C:\PhoneShare\PhoneShare.exe";
        assert!(command_matches("\"c:\\phoneshare\\phoneshare.exe\" --minimized", exe));
        assert!(!command_matches("\"C:\\Baska\\App.exe\" --minimized", exe));
    }
}
