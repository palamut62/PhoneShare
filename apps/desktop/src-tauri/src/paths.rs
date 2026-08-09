//! Yol dogrulama (PRD §40, §50).
//!
//! Masaustu paneli "Dosyayi Ac" / "Klasorde Goster" islemlerini yalnizca **receiver'in
//! bildigi gercek hedef koklerinin altindaki** yollar icin yapabilir. Frontend'den gelen
//! ham yol asla dogrudan islenmez: once normalize edilir, sonra izinli koklerle karsilastirilir.

use std::path::{Component, Path, PathBuf};

/// Yol dogrulama hatasi. Mesajlar kullaniciya gosterilecek kadar genel tutulur (PRD §71).
#[derive(Debug, PartialEq, Eq)]
pub enum PathError {
    Empty,
    NotAbsolute,
    Unc,
    Traversal,
    IllegalCharacter,
    OutsideRoots,
    NotFound,
}

impl PathError {
    pub fn message(&self) -> &'static str {
        match self {
            PathError::Empty => "Gecersiz dosya yolu.",
            PathError::NotAbsolute => "Gecersiz dosya yolu.",
            PathError::Unc => "Ag yollari (UNC) desteklenmiyor.",
            PathError::Traversal => "Gecersiz dosya yolu.",
            PathError::IllegalCharacter => "Gecersiz dosya yolu.",
            PathError::OutsideRoots => "Bu dosya PhoneShare hedef klasorlerinin disinda.",
            PathError::NotFound => "Dosya bulunamadi; tasinmis veya silinmis olabilir.",
        }
    }
}

/// Windows argumanlarinda ve komut satirinda sorun cikarabilecek karakterler.
/// `"` bir argumani erkenden kapatabilir; kontrol karakterleri ve `\0` reddedilir.
fn has_illegal_chars(raw: &str) -> bool {
    raw.chars()
        .any(|c| c == '"' || c == '\0' || c == '\n' || c == '\r' || (c as u32) < 0x20)
}

/// Ham yolu tek bicime getirir: `/` -> `\`, `..`/`.` bilesenleri **cozulmez**, reddedilir.
///
/// `..` cozmek yerine reddetmek bilincli bir tercihtir: sembolik baglantilarla birlikte
/// cozumleme kacisa yol acabilir, reddetmek her zaman guvenlidir.
pub fn normalize(raw: &str) -> Result<PathBuf, PathError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(PathError::Empty);
    }
    if has_illegal_chars(trimmed) {
        return Err(PathError::IllegalCharacter);
    }
    let unified = trimmed.replace('/', "\\");
    if unified.starts_with("\\\\") {
        return Err(PathError::Unc);
    }
    // Metin duzeyinde `..` / `.` bileseni kontrolu (platformdan bagimsiz).
    if unified
        .split('\\')
        .any(|segment| segment == ".." || segment == ".")
    {
        return Err(PathError::Traversal);
    }
    let path = Path::new(&unified);
    for component in path.components() {
        match component {
            Component::ParentDir | Component::CurDir => return Err(PathError::Traversal),
            _ => {}
        }
    }
    // Mutlak yol kontrolu: Windows'ta `C:\...`, diger platformlarda `/...`.
    // Testlerin platformdan bagimsiz olmasi icin surucu harfi de ayrica kabul edilir.
    if !path.is_absolute() && !looks_like_windows_absolute(&unified) {
        return Err(PathError::NotAbsolute);
    }
    Ok(PathBuf::from(unified))
}

fn looks_like_windows_absolute(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && bytes[2] == b'\\'
}

fn compare_key(value: &str) -> String {
    // Windows dosya sistemi buyuk/kucuk harfe duyarsizdir; sondaki ayiriclar atilir.
    value.trim_end_matches('\\').to_lowercase()
}

/// `candidate` verilen koklerden **birinin** altinda mi (veya kokun kendisi mi)?
pub fn is_under_roots(candidate: &Path, roots: &[String]) -> bool {
    let candidate_key = compare_key(&candidate.to_string_lossy());
    roots.iter().any(|root| {
        let root_key = match normalize(root) {
            Ok(path) => compare_key(&path.to_string_lossy()),
            Err(_) => return false,
        };
        if root_key.is_empty() {
            return false;
        }
        candidate_key == root_key || candidate_key.starts_with(&format!("{root_key}\\"))
    })
}

/// Panelden gelen ham yolu dogrular. `must_exist` true ise diskte var olmasi gerekir.
pub fn validate_for_shell(
    raw: &str,
    roots: &[String],
    must_exist: bool,
) -> Result<PathBuf, PathError> {
    let path = normalize(raw)?;
    if !is_under_roots(&path, roots) {
        return Err(PathError::OutsideRoots);
    }
    if must_exist && !path.exists() {
        return Err(PathError::NotFound);
    }
    Ok(path)
}

/// `explorer /select,"<path>"` icin tek arguman uretir.
///
/// explorer.exe `/select,` ekini ve yolu **tek** arguman olarak bekler. Yol daha once
/// dogrulandigi icin tirnak/kontrol karakteri icermez; ayrica burada da savunma amacli
/// tekrar kontrol edilir. Komut `cmd.exe` uzerinden degil, dogrudan calistirilir —
/// bu yuzden `&`, `|`, `^` gibi kabuk metakarakterleri anlamsizdir.
pub fn explorer_select_arg(path: &Path) -> Result<String, PathError> {
    let value = path.to_string_lossy().to_string();
    if has_illegal_chars(&value) {
        return Err(PathError::IllegalCharacter);
    }
    Ok(format!("/select,{value}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roots() -> Vec<String> {
        vec![
            "D:\\PhoneShare".to_string(),
            "D:\\DSI\\Projeler\\Akpazar".to_string(),
        ]
    }

    #[test]
    fn normalize_accepts_windows_absolute_path() {
        let path = normalize("D:/PhoneShare/rapor.pdf").unwrap();
        assert_eq!(path.to_string_lossy(), "D:\\PhoneShare\\rapor.pdf");
    }

    #[test]
    fn normalize_rejects_empty_and_relative() {
        assert_eq!(normalize("   "), Err(PathError::Empty));
        assert_eq!(normalize("PhoneShare\\a.txt"), Err(PathError::NotAbsolute));
    }

    #[test]
    fn normalize_rejects_traversal_unc_and_quotes() {
        assert_eq!(normalize("D:\\PhoneShare\\..\\Windows"), Err(PathError::Traversal));
        assert_eq!(normalize("\\\\sunucu\\pay\\a.txt"), Err(PathError::Unc));
        assert_eq!(
            normalize("D:\\PhoneShare\\a\" & calc.exe"),
            Err(PathError::IllegalCharacter)
        );
        assert_eq!(
            normalize("D:\\PhoneShare\\a\nb"),
            Err(PathError::IllegalCharacter)
        );
    }

    #[test]
    fn is_under_roots_matches_only_real_children() {
        assert!(is_under_roots(
            Path::new("D:\\PhoneShare\\Belgeler\\a.pdf"),
            &roots()
        ));
        assert!(is_under_roots(Path::new("d:\\phoneshare"), &roots()));
        assert!(!is_under_roots(Path::new("D:\\PhoneShareGizli\\a.pdf"), &roots()));
        assert!(!is_under_roots(Path::new("C:\\Windows\\system32"), &roots()));
    }

    #[test]
    fn validate_for_shell_rejects_paths_outside_roots() {
        assert_eq!(
            validate_for_shell("C:\\Windows\\system32\\calc.exe", &roots(), false),
            Err(PathError::OutsideRoots)
        );
        assert!(validate_for_shell("D:\\PhoneShare\\a.pdf", &roots(), false).is_ok());
    }

    #[test]
    fn explorer_select_arg_is_a_single_argument() {
        let arg = explorer_select_arg(Path::new("D:\\PhoneShare\\yeni rapor.pdf")).unwrap();
        assert_eq!(arg, "/select,D:\\PhoneShare\\yeni rapor.pdf");
        assert_eq!(arg.matches("/select,").count(), 1);
    }

    #[test]
    fn explorer_select_arg_rejects_quotes() {
        assert_eq!(
            explorer_select_arg(Path::new("D:\\a\" \"C:\\Windows")),
            Err(PathError::IllegalCharacter)
        );
    }
}
