//! Windows sistem tepsisi (PRD §8).
//!
//! Menü yapisi:
//!
//! ```text
//! PhoneShare
//! ● Receiver Online
//! iPhone ● Connected
//! ──────────────
//! Yeni Telefon Ekle / Web Panelini Aç / Gelen Dosyalar / Klasörü Aç / Ayarlar / Receiver'ı Durdur / Çıkış
//! ```
//!
//! Tepsi simgesi tauri.conf.json'daki `trayIcon` yapilandirmasiyla olusturulur
//! (id: `phoneshare-tray`); burada yalnizca menü, ikon ve olay dinleyicileri
//! baglanir. Durum satirlari `refresh` ile guncellenir; ikon `tray-online.png` /
//! `tray-offline.png` arasinda degisir (derleme zamaninda gomulur — paketleme
//! sonrasi da calisir). Sol tik ana pencereyi gosterir, menü sag tikta acilir.

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::commands;
use crate::state::AppState;

/// tauri.conf.json `app.trayIcon.id` ile ayni olmalidir.
const TRAY_ID: &str = "phoneshare-tray";

const MENU_STATUS_TITLE: &str = "status_title";
const MENU_STATUS_RECEIVER: &str = "status_receiver";
const MENU_STATUS_DEVICE: &str = "status_device";
const MENU_ADD_PHONE: &str = "add_phone";
const MENU_WEB_PANEL: &str = "web_panel";
const MENU_INCOMING: &str = "incoming";
const MENU_OPEN_FOLDER: &str = "open_folder";
const MENU_SETTINGS: &str = "settings";
const MENU_STOP_RECEIVER: &str = "stop_receiver";
const MENU_QUIT: &str = "quit";

/// Tepsi menüsünü ve dinleyicileri baglar. Config'teki `trayIcon` ile otomatik
/// olusturulan tepsiye uygulanir; tepsi yoksa (nadiren) ayrica olusturulur.
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;
    let tray = match app.tray_by_id(TRAY_ID) {
        Some(tray) => {
            tray.set_menu(Some(menu))?;
            tray
        }
        None => {
            TrayIconBuilder::with_id(TRAY_ID)
                .tooltip("PhoneShare")
                .show_menu_on_left_click(false)
                .menu(&menu)
                .build(app)?
        }
    };

    // tauri.conf.json'daki `trayIcon.iconPath` ile ayni dosyalar; duruma gore
    // online/offline ikonu gosterilir. Her ikisi de derleme zamaninda gomulu.
    tray.set_icon(Some(load_tray_icon(false)?))?;
    tray.set_tooltip(Some("PhoneShare"))?;
    tray.on_menu_event(|app, event| handle_menu_event(app, event.id().as_ref()));
    tray.on_tray_icon_event(|tray, event| {
        // PRD §8 — sol tik ana pencereyi gosterir (menü sag tikta acilir).
        if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        } = event
        {
            let app = tray.app_handle();
            commands::show_main_window(app.clone());
        }
    });
    Ok(())
}

/// Menüyü ve ikonu mevcut duruma gore yeniden kurar.
/// `report_status`, `start_receiver` / `stop_receiver` komutlarindan cagrilir.
pub fn refresh(app: &AppHandle) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    if let Ok(menu) = build_menu(app) {
        let _ = tray.set_menu(Some(menu));
    }
    if let Ok(icon) = load_tray_icon(app.state::<AppState>().is_online()) {
        let _ = tray.set_icon(Some(icon));
    }
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let state = app.state::<AppState>();
    let online = state.is_online();
    let connected = state.connected_devices();

    let title = MenuItem::with_id(app, MENU_STATUS_TITLE, "PhoneShare", false, None::<&str>)?;
    let receiver_line = if online {
        "● Receiver Online"
    } else {
        "● Receiver Cevrimdisi"
    };
    let receiver =
        MenuItem::with_id(app, MENU_STATUS_RECEIVER, receiver_line, false, None::<&str>)?;
    let device_line = if connected > 0 {
        format!("iPhone ● {connected} Bagli")
    } else {
        "iPhone ● Bagli Degil".to_string()
    };
    let device =
        MenuItem::with_id(app, MENU_STATUS_DEVICE, &device_line, false, None::<&str>)?;

    // PRD §12 — eslestirme en gorunur eylem: durum satirlarinin hemen altinda.
    let add_phone =
        MenuItem::with_id(app, MENU_ADD_PHONE, "+ Yeni Telefon Ekle", true, None::<&str>)?;
    let web_panel =
        MenuItem::with_id(app, MENU_WEB_PANEL, "Web Panelini Ac", true, None::<&str>)?;
    let incoming =
        MenuItem::with_id(app, MENU_INCOMING, "Gelen Dosyalar", true, None::<&str>)?;
    let open_folder = MenuItem::with_id(app, MENU_OPEN_FOLDER, "Klasoru Ac", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, MENU_SETTINGS, "Ayarlar", true, None::<&str>)?;
    let stop =
        MenuItem::with_id(app, MENU_STOP_RECEIVER, "Receiver'i Durdur", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "Cikis", true, None::<&str>)?;

    Menu::with_items(
        app,
        &[
            &title,
            &receiver,
            &device,
            &PredefinedMenuItem::separator(app)?,
            &add_phone,
            &PredefinedMenuItem::separator(app)?,
            &web_panel,
            &incoming,
            &open_folder,
            &settings,
            &stop,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )
}

fn handle_menu_event(app: &AppHandle, id: &str) {
    match id {
        MENU_ADD_PHONE => {
            // Panel acilir ve "Yeni Telefon Ekle" dialogu kendiliginden gosterilir.
            app.state::<AppState>().request_pair_prompt();
            show_panel(app);
        }
        MENU_WEB_PANEL => show_panel(app),
        MENU_INCOMING => {
            let _ = commands::open_base_folder(app.state());
        }
        MENU_OPEN_FOLDER => pick_and_set_folder(app),
        MENU_SETTINGS => commands::show_main_window(app.clone()),
        MENU_STOP_RECEIVER => {
            let _ = commands::stop_receiver(app.clone(), app.state());
        }
        MENU_QUIT => crate::shutdown(app),
        _ => {}
    }
}

/// "Web Panelini Ac": ana pencereyi on plana getirir. Pencere ilk yuklemede
/// dev'de `devUrl`, uretimde `frontendDist` adresini gosterir; dev'de baska bir
/// adrese gidilmisse (panel ici gezinme) tekrar `devUrl`'ye donulur.
fn show_panel(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
    #[cfg(debug_assertions)]
    if let Some(dev_url) = app.config().build.dev_url.clone() {
        let current = window.url().map(|url| url.to_string()).unwrap_or_default();
        if !current.starts_with(dev_url.as_str()) {
            let _ = window.navigate(dev_url);
        }
    }
}

/// "Klasoru Ac": kullaniciya klasor sectirir ve ana klasor olarak kaydeder.
/// Komutlar yeniden kullanilir (`pick_folder` + `update_config`) — dogrulama ve
/// receiver config yazimi tek noktadan gecer, mantik kopyalanmaz.
fn pick_and_set_folder(app: &AppHandle) {
    let Some(path) = commands::pick_folder(app.clone(), None) else {
        return;
    };
    let state = app.state::<AppState>();
    let patch = commands::ConfigPatch {
        base_folder: Some(path),
        receiver_host: None,
        receiver_port: None,
        receiver_tls: None,
        minimize_to_tray: None,
        theme: None,
        setup_completed: Some(true),
    };
    let _ = commands::update_config(state, patch);
}

/// tauri.conf.json `trayIcon.iconPath` ile ayni dosyalar; derleme zamaninda
/// gomulur (`include_bytes!`). Dosyalar `src-tauri/icons/` altindadir.
fn load_tray_icon(online: bool) -> tauri::Result<Image<'static>> {
    let bytes: &[u8] = if online {
        include_bytes!("../icons/tray-online.png")
    } else {
        include_bytes!("../icons/tray-offline.png")
    };
    Image::from_bytes(bytes)
}
