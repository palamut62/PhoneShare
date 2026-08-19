//! Konsol penceresi acmadan alt surec calistirma.
//!
//! Windows'ta GUI uygulamasindan konsol tabanli bir arac (`tailscale`, `netsh`,
//! `python`) calistirilinca isletim sistemi kisa omurlu bir konsol penceresi
//! acar. Durum sorgulari periyodik oldugu icin bu ekranda saniyede bir yanip
//! sonen pencere olarak gorunur. `CREATE_NO_WINDOW` bunu engeller.

use std::ffi::OsStr;
use std::process::Command;

/// Windows `CREATE_NO_WINDOW` proses olusturma bayragi.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// `Command::new` yerine kullanilir: Windows'ta konsol penceresi acilmaz,
/// diger platformlarda davranis degismez.
pub fn command<S: AsRef<OsStr>>(program: S) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}
