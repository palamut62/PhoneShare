//! Receiver'in kendi `config.json` dosyasina (yalnizca) veri duzeyinde dokunur.
//!
//! Receiver kaynak kodu degistirilmez; burada sadece `%LOCALAPPDATA%\PhoneShare\config.json`
//! icindeki alanlar okunur/yazilir. Bilinmeyen alanlar oldugu gibi korunur.

use std::fs;
use std::path::PathBuf;

use serde_json::{Map, Value};

use crate::config::app_data_dir;

pub fn receiver_config_file() -> PathBuf {
    app_data_dir().join("config.json")
}

fn read_object() -> Map<String, Value> {
    fs::read_to_string(receiver_config_file())
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default()
}

fn write_object(object: Map<String, Value>) -> Result<(), String> {
    let file = receiver_config_file();
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent)
            .map_err(|_| "Receiver ayarlari yazilamadi.".to_string())?;
    }
    let raw = serde_json::to_string_pretty(&Value::Object(object))
        .map_err(|_| "Receiver ayarlari yazilamadi.".to_string())?;
    let temp = file.with_extension("json.tmp");
    fs::write(&temp, raw).map_err(|_| "Receiver ayarlari yazilamadi.".to_string())?;
    fs::rename(&temp, &file).map_err(|_| "Receiver ayarlari yazilamadi.".to_string())?;
    Ok(())
}

/// Ana klasoru ve izinli kokleri receiver ayarlarina isler (PRD §10 adim 4-5).
pub fn apply_base_folder(base_folder: &str) -> Result<(), String> {
    let mut object = read_object();
    object.insert("base_folder".into(), Value::String(base_folder.to_string()));

    let mut roots: Vec<String> = object
        .get("allowed_roots")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    if !roots.iter().any(|root| root.eq_ignore_ascii_case(base_folder)) {
        roots.push(base_folder.to_string());
    }
    object.insert(
        "allowed_roots".into(),
        Value::Array(roots.into_iter().map(Value::String).collect()),
    );
    write_object(object)
}

/// Izinli kok ekler (yeni hedef klasoru secildiginde).
pub fn add_allowed_root(root: &str) -> Result<(), String> {
    let mut object = read_object();
    let mut roots: Vec<String> = object
        .get("allowed_roots")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    if !roots.iter().any(|item| item.eq_ignore_ascii_case(root)) {
        roots.push(root.to_string());
    }
    object.insert(
        "allowed_roots".into(),
        Value::Array(roots.into_iter().map(Value::String).collect()),
    );
    write_object(object)
}

/// TLS sertifikasi yollarini receiver ayarlarina yazar (PRD §47/§48).
pub fn apply_tls(cert_file: &str, key_file: &str) -> Result<(), String> {
    let mut object = read_object();
    object.insert("tls_certfile".into(), Value::String(cert_file.to_string()));
    object.insert("tls_keyfile".into(), Value::String(key_file.to_string()));
    write_object(object)
}

pub fn clear_tls() -> Result<(), String> {
    let mut object = read_object();
    object.insert("tls_certfile".into(), Value::Null);
    object.insert("tls_keyfile".into(), Value::Null);
    write_object(object)
}
