//! PhoneShare masaustu kabugu (Tauri v2) — uygulama giris noktasi.
//!
//! PRD §7-§10 burada birlestirilir: otomatik baslatma (autostart.rs), sistem
//! tepsisi (tray.rs), ilk kurulum akisi (config.rs / commands.rs) ve Python
//! receiver sidecar'inin (sidecar.rs) yasam dongusu.
//!
//! - Pencere kapatilinca uygulama kapanmaz, tepside kalir (`minimize_to_tray`).
//! - `--minimized` ile baslarsa (autostart kaydi) pencere hic acilmaz (PRD §7).
//! - Cikarken sidecar mutlaka durdurulur; zombi surec birakilmaz.

mod autostart;
mod commands;
mod config;
mod firewall;
mod net;
mod paths;
mod receiver_config;
mod sidecar;
mod state;
mod tailscale;
mod tray;

use std::fs;

use tauri::{AppHandle, Manager, RunEvent};

use crate::state::AppState;

/// Uygulamadan cikis: once sidecar durdurulur, sonra surec sonlandirilir.
/// `quit_app` komutu ve tepsi "Cikis" menüsü burayi cagirir.
pub fn shutdown(app: &AppHandle) {
    let _ = app.state::<AppState>().sidecar.stop();
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            commands::show_main_window(app.clone());
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            commands::get_config,
            commands::get_device_token,
            commands::set_device_token,
            commands::update_config,
            commands::register_target_path,
            commands::forget_target_path,
            commands::start_receiver,
            commands::stop_receiver,
            commands::receiver_status,
            commands::receiver_logs,
            commands::clear_receiver_logs,
            commands::report_status,
            commands::pick_folder,
            commands::ensure_folder,
            commands::open_path,
            commands::reveal_in_explorer,
            commands::open_transfer,
            commands::reveal_transfer,
            commands::open_base_folder,
            commands::get_autostart,
            commands::set_autostart,
            commands::firewall_status,
            commands::firewall_add_rule,
            commands::access_info,
            commands::tailscale_status,
            commands::get_pair_address,
            commands::take_pair_prompt,
            commands::set_remote_access,
            commands::create_certificate,
            commands::disable_tls,
            commands::show_main_window,
            commands::quit_app,
            commands::default_base_folder,
        ])
        .setup(|app| {
            let handle = app.handle();

            // Web paneli (PWA) ciktisi (PRD §11-14): uretimde `resource_dir/web`
            // (tauri.conf.json `resources` girdisiyle eslesir). Gelistirmede
            // `resource_dir` bos oldugundan sidecar repo ici `web/out`'a duser.
            let web_dist = app.path().resource_dir().ok().map(|dir| dir.join("web"));
            app.state::<AppState>().set_web_dist(web_dist);

            // Autostart (PRD §7): kayit defterindeki gercek durum config'e islenir.
            let should_initialize_autostart = !app
                .state::<AppState>()
                .config
                .lock()
                .map(|config| config.autostart_initialized)
                .unwrap_or(false);
            if should_initialize_autostart {
                let _ = autostart::set_enabled(true);
            }
            let autostart_enabled = autostart::is_enabled();
            {
                let state = app.state::<AppState>();
                let mut config = state.config.lock().expect("config kilidi");
                if config.autostart != autostart_enabled || !config.autostart_initialized {
                    config.autostart = autostart_enabled;
                    config.autostart_initialized = true;
                    let _ = config::save(&config);
                }
            }

            // Ilk kurulum (PRD §10 adim 6): ana klasor secilmemisse sorulur;
            // vazgecilirse varsayilan klasor (`D:\PhoneShare`) kullanilir ve
            // akis yine tamamlanir (panel diledigi zaman degistirebilir).
            {
                let state = app.state::<AppState>();
                let setup_completed = state.config.lock().expect("config kilidi").setup_completed;
                if !setup_completed {
                    let picked = commands::pick_folder(
                        handle.clone(),
                        Some("PhoneShare ana klasorunu secin (varsayilan: D:\\PhoneShare)"
                            .to_string()),
                    )
                    .unwrap_or_else(config::default_base_folder);
                    {
                        let mut config = state.config.lock().expect("config kilidi");
                        config.base_folder = Some(picked.clone());
                        config.setup_completed = true;
                        let _ = config::save(&config);
                    }
                    let _ = fs::create_dir_all(&picked);
                    let _ = receiver_config::apply_base_folder(&picked);
                    // PRD §10 adim 6 — kurulum biter bitmez telefon eslestirme
                    // dialogu acilsin; kullanici kodu nerede bulacagini aramasin.
                    state.request_pair_prompt();
                }
            }

            // Sistem tepsisi (PRD §8): config'teki `trayIcon`'a menü baglanir.
            tray::setup(handle)?;

            // Receiver sidecar'ini baslat (PRD §9): kurulum tamamlandiysa daima
            // calisir; olmazsa kabuk yine acilir, panel hatayi gosterir.
            {
                let state = app.state::<AppState>();
                let web_dist = state.web_dist();
                let port = {
                    let mut config = state.config.lock().expect("config kilidi");
                    // Edge case (PRD §48): uzaktan erisim acik ama cert dosyalari
                    // kayip (silinmis/tasinmis). Tailscale calisiyorsa sessizce
                    // yeniden almayi dene; basariliysa kaydet, degilse HTTP
                    // moduna duser (receiver TLS'siz baslatilir).
                    if config.receiver_tls && config.tls_files().is_none() {
                        let status = tailscale::status(&config);
                        if status.running {
                            if let Some(dns) = status.dns_name {
                                if tailscale::fetch_cert(&dns).is_ok() {
                                    let (cert, key) = tailscale::cert_paths(&dns);
                                    config.receiver_host = dns;
                                    config.tls_certfile = Some(cert.to_string_lossy().to_string());
                                    config.tls_keyfile = Some(key.to_string_lossy().to_string());
                                } else {
                                    config.receiver_tls = false;
                                    config.tls_certfile = None;
                                    config.tls_keyfile = None;
                                }
                                let _ = config::save(&config);
                            }
                        }
                    }
                    (config.receiver_port, config.tls_files())
                };
                let (port, tls) = port;
                if let Err(err) = state.sidecar.start(handle, "0.0.0.0", port, web_dist, tls) {
                    eprintln!("[setup] receiver baslatilamadi: {err}");
                }
            }

            // Guvenlik duvari kurali (PRD §10 adim 3): kural eklemek yonetici
            // yetkisi ister; burada yalnizca durum raporlanir, ekleme panelde
            // yapilir (firewall_add_rule komutu).
            if !firewall::rule_exists() {
                eprintln!(
                    "[setup] guvenlik duvari kurali eksik: {} (panelden eklenebilir)",
                    firewall::RULE_NAME
                );
            }

            tray::refresh(handle);

            // Autostart `--minimized` bayragiyla baslattiysa pencere acilmaz.
            if std::env::args().any(|arg| arg == "--minimized") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // PRD §8: kapatma butonu uygulamayi sonlandirmaz, tepsiye kucultur
            // (yalnizca `minimize_to_tray` acikken; kapaliysa pencere kapanir,
            // uygulama `ExitRequested`'de sidecar'i durdurarak cikar).
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let minimize_to_tray = app
                    .state::<AppState>()
                    .config
                    .lock()
                    .map(|config| config.minimize_to_tray)
                    .unwrap_or(true);
                if minimize_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("PhoneShare kabugu baslatilamadi")
        .run(|app, event| {
            // Cikarken sidecar'i oldur; zombi surec birakilmaz (sidecar.rs).
            if let RunEvent::ExitRequested { .. } = event {
                let _ = app.state::<AppState>().sidecar.stop();
            }
        });
}
