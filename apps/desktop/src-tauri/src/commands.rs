//! Panelden cagrilabilen Tauri komutlari.
//!
//! Guvenlik notu (PRD §71, §93): frontend hicbir zaman ham Windows yolu ile kabuk
//! calistiramaz. `open_path` / `reveal_in_explorer` yalnizca **kayitli hedef koklerinin**
//! altindaki yollari kabul eder; hata mesajlari teknik detay sizdirmaz.

use std::fs;
use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::config::{self, DesktopConfig};
use crate::firewall;
use crate::net;
use crate::paths;
use crate::receiver_config;
use crate::sidecar::{LogLine, SidecarStatus};
use crate::state::AppState;
use crate::tailscale;
use crate::tray;

/// Panelin ihtiyac duydugu, sir icermeyen yapilandirma goruntusu.
#[derive(Debug, Clone, Serialize)]
pub struct PublicConfig {
    pub setup_completed: bool,
    pub base_folder: Option<String>,
    pub base_url: String,
    pub receiver_host: String,
    pub receiver_port: u16,
    pub receiver_tls: bool,
    pub autostart: bool,
    pub minimize_to_tray: bool,
    pub theme: String,
    pub has_token: bool,
    pub target_paths: std::collections::BTreeMap<String, String>,
}

fn public_view(config: &DesktopConfig) -> PublicConfig {
    PublicConfig {
        setup_completed: config.setup_completed,
        base_folder: config.base_folder.clone(),
        base_url: config.base_url(),
        receiver_host: config.receiver_host.clone(),
        receiver_port: config.receiver_port,
        receiver_tls: config.receiver_tls,
        autostart: config.autostart,
        minimize_to_tray: config.minimize_to_tray,
        theme: config.theme.clone(),
        has_token: config.device_token.is_some(),
        target_paths: config.target_paths.clone(),
    }
}

fn with_config<T>(state: &State<'_, AppState>, action: impl FnOnce(&mut DesktopConfig) -> T) -> T {
    let mut guard = state.config.lock().expect("config kilidi");
    action(&mut guard)
}

fn persist(state: &State<'_, AppState>) -> Result<(), String> {
    let guard = state.config.lock().map_err(|_| "Could not read settings.".to_string())?;
    config::save(&guard)
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> PublicConfig {
    with_config(&state, |config| public_view(config))
}

/// Cihaz tokeni ayri bir komutla verilir; boylece genel yapilandirma sorgusu sir tasimaz.
#[tauri::command]
pub fn get_device_token(state: State<'_, AppState>) -> Option<String> {
    with_config(&state, |config| config.device_token.clone())
}

#[tauri::command]
pub fn set_device_token(
    state: State<'_, AppState>,
    token: String,
    device_id: String,
) -> Result<(), String> {
    if token.trim().is_empty() {
        return Err("Gecersiz eslestirme yaniti.".to_string());
    }
    with_config(&state, |config| {
        config.device_token = Some(token);
        config.device_id = Some(device_id);
    });
    persist(&state)
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct ConfigPatch {
    pub base_folder: Option<String>,
    pub receiver_host: Option<String>,
    pub receiver_port: Option<u16>,
    pub receiver_tls: Option<bool>,
    pub minimize_to_tray: Option<bool>,
    pub theme: Option<String>,
    pub setup_completed: Option<bool>,
}

#[tauri::command]
pub fn update_config(
    state: State<'_, AppState>,
    patch: ConfigPatch,
) -> Result<PublicConfig, String> {
    if let Some(base) = patch.base_folder.as_deref() {
        // Ana klasor yolu da dogrulanir; UNC / `..` kabul edilmez.
        paths::normalize(base).map_err(|err| err.message().to_string())?;
    }
    if let Some(port) = patch.receiver_port {
        if port < 1024 {
            return Err("Port 1024 ve uzeri olmalidir.".to_string());
        }
    }
    if let Some(theme) = patch.theme.as_deref() {
        if !["system", "light", "dark"].contains(&theme) {
            return Err("Gecersiz tema.".to_string());
        }
    }

    let base_folder_changed = patch.base_folder.clone();
    with_config(&state, |config| {
        if let Some(value) = patch.base_folder.clone() {
            config.base_folder = Some(value);
        }
        if let Some(value) = patch.receiver_host.clone() {
            config.receiver_host = value;
        }
        if let Some(value) = patch.receiver_port {
            config.receiver_port = value;
        }
        if let Some(value) = patch.receiver_tls {
            config.receiver_tls = value;
        }
        if let Some(value) = patch.minimize_to_tray {
            config.minimize_to_tray = value;
        }
        if let Some(value) = patch.theme.clone() {
            config.theme = value;
        }
        if let Some(value) = patch.setup_completed {
            config.setup_completed = value;
        }
    });
    persist(&state)?;

    if let Some(base) = base_folder_changed {
        fs::create_dir_all(&base).map_err(|_| "Ana klasor olusturulamadi.".to_string())?;
        receiver_config::apply_base_folder(&base)?;
    }

    Ok(with_config(&state, |config| public_view(config)))
}

/// Hedef olusturuldugunda `target_id` -> gercek yol eslemesini yerelde saklar.
/// "Dosyayi Ac" / "Klasorde Goster" yalnizca bu koklerin altini kabul eder (PRD §40).
#[tauri::command]
pub fn register_target_path(
    state: State<'_, AppState>,
    target_id: String,
    path: String,
) -> Result<(), String> {
    if target_id.trim().is_empty() {
        return Err("Gecersiz hedef.".to_string());
    }
    let normalized = paths::normalize(&path).map_err(|err| err.message().to_string())?;
    let value = normalized.to_string_lossy().to_string();
    with_config(&state, |config| {
        config.target_paths.insert(target_id, value.clone());
    });
    persist(&state)?;
    receiver_config::add_allowed_root(&value)
}

#[tauri::command]
pub fn forget_target_path(state: State<'_, AppState>, target_id: String) -> Result<(), String> {
    with_config(&state, |config| {
        config.target_paths.remove(&target_id);
    });
    persist(&state)
}

/* ------------------------------ sidecar ------------------------------ */

#[tauri::command]
pub fn start_receiver(app: AppHandle, state: State<'_, AppState>) -> Result<SidecarStatus, String> {
    let (host, port, tls) = with_config(&state, |config| {
        // Sidecar daima 0.0.0.0 dinler; panel 127.0.0.1 uzerinden konusur.
        ("0.0.0.0".to_string(), config.receiver_port, config.tls_files())
    });
    state.sidecar.start(&app, &host, port, state.web_dist(), tls)?;
    let status = with_config(&state, |config| {
        state.sidecar.status(&config.receiver_host, config.receiver_port)
    });
    tray::refresh(&app);
    Ok(status)
}

#[tauri::command]
pub fn stop_receiver(app: AppHandle, state: State<'_, AppState>) -> Result<SidecarStatus, String> {
    state.sidecar.stop()?;
    state.set_online(false);
    state.set_connected_devices(0);
    let status = with_config(&state, |config| {
        state.sidecar.status(&config.receiver_host, config.receiver_port)
    });
    tray::refresh(&app);
    Ok(status)
}

#[tauri::command]
pub fn receiver_status(state: State<'_, AppState>) -> SidecarStatus {
    with_config(&state, |config| {
        state.sidecar.status(&config.receiver_host, config.receiver_port)
    })
}

#[tauri::command]
pub fn receiver_logs(state: State<'_, AppState>) -> Vec<LogLine> {
    state.sidecar.logs()
}

#[tauri::command]
pub fn clear_receiver_logs(state: State<'_, AppState>) {
    state.sidecar.clear_logs();
}

/// Panel `/api/health` sonucunu buraya bildirir; tepsi menusu bununla guncellenir (PRD §8).
#[tauri::command]
pub fn report_status(
    app: AppHandle,
    state: State<'_, AppState>,
    online: bool,
    connected_devices: u32,
) {
    state.set_online(online);
    state.set_connected_devices(connected_devices);
    tray::refresh(&app);
}

/* ------------------------------ dosya sistemi ------------------------------ */

#[tauri::command]
pub fn pick_folder(app: AppHandle, title: Option<String>) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    let dialog = app
        .dialog()
        .file()
        .set_title(title.unwrap_or_else(|| "Klasor secin".to_string()));
    dialog
        .blocking_pick_folder()
        .and_then(|folder| folder.into_path().ok())
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn ensure_folder(path: String) -> Result<String, String> {
    let normalized = paths::normalize(&path).map_err(|err| err.message().to_string())?;
    fs::create_dir_all(&normalized).map_err(|_| "Klasor olusturulamadi.".to_string())?;
    Ok(normalized.to_string_lossy().to_string())
}

fn allowed_roots(state: &State<'_, AppState>) -> Vec<String> {
    with_config(state, |config| config.effective_roots())
}

fn spawn_explorer(args: Vec<String>) -> Result<(), String> {
    // Kabuk (cmd.exe) kullanilmaz: her arguman ayri gecer, metakarakter yorumlanmaz.
    Command::new("explorer.exe")
        .args(&args)
        .spawn()
        .map(|_| ())
        .map_err(|_| "Windows Gezgini acilamadi.".to_string())
}

/// PRD §40 — "Dosyayi Ac". Yol izinli koklerin altinda olmali ve diskte bulunmalidir.
#[tauri::command]
pub fn open_path(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let roots = allowed_roots(&state);
    let validated = paths::validate_for_shell(&path, &roots, true)
        .map_err(|err| err.message().to_string())?;
    spawn_explorer(vec![validated.to_string_lossy().to_string()])
}

/// PRD §40 — "Klasorde Goster" (`explorer /select,"<path>"`).
#[tauri::command]
pub fn reveal_in_explorer(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let roots = allowed_roots(&state);
    let validated = paths::validate_for_shell(&path, &roots, true)
        .map_err(|err| err.message().to_string())?;
    let arg = paths::explorer_select_arg(&validated).map_err(|err| err.message().to_string())?;
    spawn_explorer(vec![arg])
}

/// Transferin gercek yolu API'de donmez (PRD §93); hedef yolu + kayitli dosya adindan
/// yerel eslemeyle uretilir ve yine dogrulanir.
fn transfer_path(
    state: &State<'_, AppState>,
    target_id: &str,
    stored_filename: &str,
) -> Result<PathBuf, String> {
    if stored_filename.contains('\\')
        || stored_filename.contains('/')
        || stored_filename.contains("..")
    {
        return Err("Gecersiz dosya adi.".to_string());
    }
    let root = with_config(state, |config| config.target_paths.get(target_id).cloned())
        .ok_or_else(|| "Bu hedefin klasoru bu bilgisayarda tanimli degil.".to_string())?;
    let candidate = PathBuf::from(&root).join(stored_filename);
    let roots = allowed_roots(state);
    paths::validate_for_shell(&candidate.to_string_lossy(), &roots, true)
        .map_err(|err| err.message().to_string())
}

#[tauri::command]
pub fn open_transfer(
    state: State<'_, AppState>,
    target_id: String,
    stored_filename: String,
) -> Result<(), String> {
    let path = transfer_path(&state, &target_id, &stored_filename)?;
    spawn_explorer(vec![path.to_string_lossy().to_string()])
}

#[tauri::command]
pub fn reveal_transfer(
    state: State<'_, AppState>,
    target_id: String,
    stored_filename: String,
) -> Result<(), String> {
    let path = transfer_path(&state, &target_id, &stored_filename)?;
    let arg = paths::explorer_select_arg(&path).map_err(|err| err.message().to_string())?;
    spawn_explorer(vec![arg])
}

/// Tepsi menusundeki "Klasoru Ac" ve panel kisayolu.
#[tauri::command]
pub fn open_base_folder(state: State<'_, AppState>) -> Result<(), String> {
    let base = with_config(&state, |config| config.base_folder.clone())
        .ok_or_else(|| "Ana klasor henuz secilmedi.".to_string())?;
    let roots = allowed_roots(&state);
    let validated =
        paths::validate_for_shell(&base, &roots, true).map_err(|err| err.message().to_string())?;
    spawn_explorer(vec![validated.to_string_lossy().to_string()])
}

/* ------------------------------ auto-start ------------------------------ */

#[tauri::command]
pub fn get_autostart() -> bool {
    crate::autostart::is_enabled()
}

#[tauri::command]
pub fn set_autostart(state: State<'_, AppState>, enabled: bool) -> Result<bool, String> {
    crate::autostart::set_enabled(enabled)?;
    with_config(&state, |config| {
        config.autostart = enabled;
        config.autostart_initialized = true;
    });
    persist(&state)?;
    Ok(crate::autostart::is_enabled())
}

/* ------------------------------ firewall ------------------------------ */

#[tauri::command]
pub fn firewall_status() -> bool {
    firewall::rule_exists()
}

#[tauri::command]
pub fn firewall_add_rule(state: State<'_, AppState>) -> Result<(), String> {
    let port = with_config(&state, |config| config.receiver_port);
    firewall::add_rule(port)
}

/* ------------------------------ uzaktan erisim ------------------------------ */

#[tauri::command]
pub fn access_info(state: State<'_, AppState>) -> net::AccessInfo {
    let (port, tls) = with_config(&state, |config| (config.receiver_port, config.receiver_tls));
    net::collect(port, tls)
}

/// Tailscale'in kurulum/baglanti durumu ve uzaktan erisimin etkinligi (PRD §48).
#[tauri::command]
pub fn tailscale_status(state: State<'_, AppState>) -> tailscale::TailscaleStatus {
    with_config(&state, |config| tailscale::status(config))
}

/// QR icerigindeki receiver adresinin config'ten gelen adresi (PRD §12).
/// Yalnizca Tailscale modunda (host `.ts.net` icerir) anlamlidir; yerel modda
/// None doner ve panel receiver'dan gelen URL'i oldugu gibi kullanir.
///
/// `port` de doner: yalnizca scheme/host degistirilirse eski port URL'de kalir
/// ve telefon yanlis porta baglanmaya calisir (yasanan hata).
#[derive(Debug, Clone, Serialize)]
pub struct PairAddressInfo {
    pub scheme: String,
    pub host: String,
    /// Varsayilan port (http 80 / https 443) ise None — URL'de port gosterilmez.
    pub port: Option<u16>,
}

#[tauri::command]
pub fn get_pair_address(state: State<'_, AppState>) -> Option<PairAddressInfo> {
    with_config(&state, |config| {
        if config.receiver_host.contains(".ts.net") {
            let default_port = if config.receiver_tls { 443 } else { 80 };
            Some(PairAddressInfo {
                scheme: if config.receiver_tls { "https" } else { "http" }.to_string(),
                host: config.receiver_host.clone(),
                port: if config.receiver_port == default_port {
                    None
                } else {
                    Some(config.receiver_port)
                },
            })
        } else {
            None
        }
    })
}

/// Panelin "eslestirme dialogunu ac" istegini bir kez tuketir (PRD §10 adim 6).
/// Ilk kurulum sihirbazi bittiginde ve tepsideki "Yeni Telefon Ekle" tiklandiginda
/// bayrak set edilir; panel acilista/odaklanmada bunu sorar.
#[tauri::command]
pub fn take_pair_prompt(state: State<'_, AppState>) -> bool {
    state.take_pair_prompt()
}

/// Uzaktan erisim acildiktan/kapatildiktan sonra panele donen durum.
#[derive(Debug, Clone, Serialize)]
pub struct TailscaleRemoteState {
    pub enabled: bool,
    pub https: bool,
    pub dns_name: String,
    pub ipv4: Option<String>,
    pub message: Option<String>,
}

/// Receiver'i durdurur ve config'teki guncel ayarlarla yeniden baslatir
/// (host = config.receiver_host, TLS = config.tls_files()).
fn restart_receiver(app: &AppHandle, state: &State<'_, AppState>) -> Result<(), String> {
    state.sidecar.stop()?;
    let (host, port, tls) = with_config(state, |config| {
        (
            config.receiver_host.clone(),
            config.receiver_port,
            config.tls_files(),
        )
    });
    let result = state
        .sidecar
        .start(app, &host, port, state.web_dist(), tls);
    tray::refresh(app);
    result
}

/// Uzaktan erisim (Tailscale) ac/kapat (PRD §48). Acilirken `tailscale cert`
/// denenir: tailnet'te HTTPS kapaliysa hata sayilmaz, HTTP moduna dusulur
/// (WireGuard zaten sifreli); Tailscale IPv4'u yine gosterilir.
#[tauri::command]
pub fn set_remote_access(
    enabled: bool,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<TailscaleRemoteState, String> {
    if enabled {
        enable_remote_access(&app, &state)
    } else {
        disable_remote_access(&app, &state)
    }
}

fn enable_remote_access(
    app: &AppHandle,
    state: &State<'_, AppState>,
) -> Result<TailscaleRemoteState, String> {
    if tailscale::cli().is_none() {
        return Err("Tailscale kurulu degil. https://tailscale.com adresinden kurun.".to_string());
    }
    let status = with_config(state, |config| tailscale::status(config));
    if !status.running {
        return Err("Tailscale calismiyor; uygulamayi acin ve giris yapin.".to_string());
    }
    let dns = status
        .dns_name
        .clone()
        .ok_or_else(|| "Tailscale DNS adi alinamadi.".to_string())?;

    // HTTPS sertifikasi dene; olmazsa HTTP moduna duser, is yine tamamlanir.
    let (https, message) = match tailscale::fetch_cert(&dns) {
        Ok(()) => {
            let (cert, key) = tailscale::cert_paths(&dns);
            with_config(state, |config| {
                config.receiver_tls = true;
                config.receiver_host = dns.clone();
                config.tls_certfile = Some(cert.to_string_lossy().to_string());
                config.tls_keyfile = Some(key.to_string_lossy().to_string());
            });
            (true, None)
        }
        Err(_) => {
            with_config(state, |config| {
                config.receiver_tls = false;
                config.receiver_host = dns.clone();
                config.tls_certfile = None;
                config.tls_keyfile = None;
            });
            (
                false,
                Some(
                    "HTTPS sertifikasi tailnet'te kapali; https://login.tailscale.com/admin/dns adresinden 'HTTPS Certificates' acilabilir. Baglanti yine de sifreli (Tailscale VPN)."
                        .to_string(),
                ),
            )
        }
    };

    persist(state)?;
    restart_receiver(app, state)?;

    Ok(TailscaleRemoteState {
        enabled: true,
        https,
        dns_name: dns,
        ipv4: status.ipv4,
        message,
    })
}

fn disable_remote_access(
    app: &AppHandle,
    state: &State<'_, AppState>,
) -> Result<TailscaleRemoteState, String> {
    with_config(state, |config| {
        config.receiver_host = "127.0.0.1".to_string();
        config.receiver_tls = false;
        config.tls_certfile = None;
        config.tls_keyfile = None;
    });
    persist(state)?;
    restart_receiver(app, state)?;

    Ok(TailscaleRemoteState {
        enabled: false,
        https: false,
        dns_name: "127.0.0.1".to_string(),
        ipv4: None,
        message: None,
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct CertResult {
    pub cert_file: String,
    pub key_file: String,
    pub note: String,
}

fn certs_dir() -> Result<PathBuf, String> {
    let dir = config::app_data_dir().join("certs");
    fs::create_dir_all(&dir).map_err(|_| "Sertifika klasoru olusturulamadi.".to_string())?;
    Ok(dir)
}

fn certgen_binary() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let candidate = exe.parent()?.join("phoneshare-certgen.exe");
    candidate.exists().then_some(candidate)
}

/// `kind`: `self_signed` (scripts/gen_cert.py) veya `tailscale` (`tailscale cert`).
#[tauri::command]
pub fn create_certificate(
    state: State<'_, AppState>,
    kind: String,
    host: String,
) -> Result<CertResult, String> {
    // Host yalnizca IP / DNS karakterleri icerebilir — komuta gecmeden once suzulur.
    if host.trim().is_empty()
        || !host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == ':')
    {
        return Err("Gecersiz adres.".to_string());
    }
    let dir = certs_dir()?;

    let (cert_file, key_file) = match kind.as_str() {
        "tailscale" => {
            let cert = dir.join(format!("{host}.crt"));
            let key = dir.join(format!("{host}.key"));
            let output = Command::new("tailscale")
                .arg("cert")
                .arg("--cert-file")
                .arg(&cert)
                .arg("--key-file")
                .arg(&key)
                .arg(&host)
                .output()
                .map_err(|_| "Tailscale bulunamadi.".to_string())?;
            if !output.status.success() {
                return Err(
                    "Tailscale sertifikasi alinamadi. MagicDNS ve HTTPS ayarlarini kontrol edin."
                        .to_string(),
                );
            }
            (cert, key)
        }
        "self_signed" => {
            let mut command = match certgen_binary() {
                Some(exe) => Command::new(exe),
                None => {
                    let mut command = Command::new(
                        std::env::var("PHONESHARE_PYTHON").unwrap_or_else(|_| "python".to_string()),
                    );
                    command.arg("scripts/gen_cert.py");
                    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
                    if let Some(root) = manifest.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
                        command.current_dir(root);
                    }
                    command
                }
            };
            let output = command
                .arg("--host")
                .arg(&host)
                .output()
                .map_err(|_| "Sertifika araci calistirilamadi.".to_string())?;
            if !output.status.success() {
                return Err("Sertifika olusturulamadi.".to_string());
            }
            (
                config::app_data_dir().join("certs").join("phoneshare.crt"),
                config::app_data_dir().join("certs").join("phoneshare.key"),
            )
        }
        _ => return Err("Gecersiz sertifika turu.".to_string()),
    };

    receiver_config::apply_tls(
        &cert_file.to_string_lossy(),
        &key_file.to_string_lossy(),
    )?;
    with_config(&state, |config| config.receiver_tls = true);
    persist(&state)?;

    Ok(CertResult {
        cert_file: cert_file.to_string_lossy().to_string(),
        key_file: key_file.to_string_lossy().to_string(),
        note: "Sertifika etkin olmasi icin Receiver'i yeniden baslatin.".to_string(),
    })
}

#[tauri::command]
pub fn disable_tls(state: State<'_, AppState>) -> Result<(), String> {
    receiver_config::clear_tls()?;
    with_config(&state, |config| config.receiver_tls = false);
    persist(&state)
}

/* ------------------------------ pencere ------------------------------ */

#[tauri::command]
pub fn show_main_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    crate::shutdown(&app);
}

#[tauri::command]
pub fn default_base_folder() -> String {
    config::default_base_folder()
}
