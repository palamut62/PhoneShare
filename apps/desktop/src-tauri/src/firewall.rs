//! Windows Guvenlik Duvari kurali (PRD §10 adim 3).
//!
//! `netsh advfirewall firewall add rule ...` **yonetici yetkisi ister**. Yetki yoksa
//! kural eklenemez; bu durumda kullaniciya LAN uzerinden erisimin calismayabilecegi
//! acikca soylenir (sihirbaz adimi bunu isler).

use std::process::Command;

pub const RULE_NAME: &str = "PhoneShare Receiver";

/// `netsh` argumanlarini uretir. Kabuk (cmd.exe) kullanilmaz; her arguman ayri verilir,
/// bu yuzden metakarakter enjeksiyonu mumkun degildir. Port sayisal tiptir.
pub fn add_rule_args(port: u16) -> Vec<String> {
    vec![
        "advfirewall".into(),
        "firewall".into(),
        "add".into(),
        "rule".into(),
        format!("name={RULE_NAME}"),
        "dir=in".into(),
        "action=allow".into(),
        "protocol=TCP".into(),
        format!("localport={port}"),
        // Yalnizca ozel/alan aglari; genel aglarda (kafe Wi-Fi) acilmaz.
        "profile=private,domain".into(),
        "enable=yes".into(),
    ]
}

pub fn delete_rule_args() -> Vec<String> {
    vec![
        "advfirewall".into(),
        "firewall".into(),
        "delete".into(),
        "rule".into(),
        format!("name={RULE_NAME}"),
    ]
}

pub fn show_rule_args() -> Vec<String> {
    vec![
        "advfirewall".into(),
        "firewall".into(),
        "show".into(),
        "rule".into(),
        format!("name={RULE_NAME}"),
    ]
}

fn run(args: Vec<String>) -> Result<String, String> {
    let output = Command::new("netsh")
        .args(&args)
        .output()
        .map_err(|_| "Guvenlik duvari araci calistirilamadi.".to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if output.status.success() {
        Ok(stdout)
    } else {
        Err("Guvenlik duvari kurali eklenemedi. Yonetici izni gerekiyor olabilir.".to_string())
    }
}

pub fn rule_exists() -> bool {
    run(show_rule_args()).is_ok()
}

pub fn add_rule(port: u16) -> Result<(), String> {
    run(add_rule_args(port)).map(|_| ())
}

pub fn delete_rule() -> Result<(), String> {
    run(delete_rule_args()).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_rule_args_contain_port_and_name() {
        let args = add_rule_args(8765);
        assert!(args.contains(&"name=PhoneShare Receiver".to_string()));
        assert!(args.contains(&"localport=8765".to_string()));
        assert!(args.contains(&"profile=private,domain".to_string()));
        // Kural yalnizca gelen baglantilar icin ve TCP olmalidir.
        assert!(args.contains(&"dir=in".to_string()));
        assert!(args.contains(&"protocol=TCP".to_string()));
    }

    #[test]
    fn every_argument_is_separate_no_shell_string() {
        // Tek bir arguman icinde bosluk disinda kabuk metakarakteri bulunmamali.
        for arg in add_rule_args(8765) {
            assert!(!arg.contains('&') && !arg.contains('|') && !arg.contains('>'));
        }
    }

    #[test]
    fn delete_and_show_target_the_same_rule() {
        assert_eq!(delete_rule_args()[4], format!("name={RULE_NAME}"));
        assert_eq!(show_rule_args()[4], format!("name={RULE_NAME}"));
    }
}
