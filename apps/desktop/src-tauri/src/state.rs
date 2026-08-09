//! Tauri yonetimli uygulama durumu (`AppState`) — komutlarin paylastigi tek nokta.
//!
//! - `config`: kabuk yapilandirmasi (`desktop.json`), komutlar `Mutex` uzerinden okur/yazar.
//! - `sidecar`: Python receiver sureci (sidecar.rs).
//! - `web_dist`: PWA static ciktisi (`--web-dist`); uretimde `resource_dir/web`,
//!   gelistirmede repo ici `web/out` (sidecar dev modunda kendisi de dener).
//! - `online` / `connected_devices`: PRD §8 tepsi menüsünün canli durumu; panel
//!   `/api/health` sonucunu `report_status` komutuyla bildirir.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;

use crate::config::{self, DesktopConfig};
use crate::sidecar::Sidecar;

pub struct AppState {
    /// Kabuk yapilandirmasi (`%LOCALAPPDATA%\PhoneShare\desktop.json`).
    pub config: Mutex<DesktopConfig>,
    /// Python receiver'in sidecar sureci.
    pub sidecar: Sidecar,
    /// PWA static ciktisi (`--web-dist`). Baslangicta bilinmez; lib.rs setup'inda
    /// `resource_dir/web` ile doldurulur (dev'de repo ici `web/out`'a dusulur).
    web_dist: Mutex<Option<PathBuf>>,
    /// Tepsi menüsündeki "Receiver Online" durumu.
    online: AtomicBool,
    /// Tepsi menüsündeki bagli cihaz sayisi ("iPhone ● Connected").
    connected_devices: AtomicU32,
    /// Panelin acilista gostermesi gereken eslestirme dialogu (PRD §10 adim 6).
    pair_prompt: AtomicBool,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            config: Mutex::new(config::load()),
            sidecar: Sidecar::default(),
            web_dist: Mutex::new(None),
            online: AtomicBool::new(false),
            connected_devices: AtomicU32::new(0),
            pair_prompt: AtomicBool::new(false),
        }
    }

    /// Web paneli (PWA) static ciktisi. Bir kez, lib.rs setup'inda atanir.
    pub fn set_web_dist(&self, path: Option<PathBuf>) {
        if let Ok(mut slot) = self.web_dist.lock() {
            *slot = path;
        }
    }

    pub fn web_dist(&self) -> Option<PathBuf> {
        self.web_dist.lock().ok().and_then(|slot| slot.clone())
    }

    /// Panel `/api/health` durumunu bildirir (PRD §8 — tepsi guncellenir).
    pub fn set_online(&self, online: bool) {
        self.online.store(online, Ordering::Relaxed);
    }

    pub fn is_online(&self) -> bool {
        self.online.load(Ordering::Relaxed)
    }

    pub fn set_connected_devices(&self, count: u32) {
        self.connected_devices.store(count, Ordering::Relaxed);
    }

    pub fn connected_devices(&self) -> u32 {
        self.connected_devices.load(Ordering::Relaxed)
    }

    /// Panelden "Yeni Telefon Ekle" dialogunun acilmasini ister (tek seferlik).
    pub fn request_pair_prompt(&self) {
        self.pair_prompt.store(true, Ordering::Relaxed);
    }

    /// Bayragi okur ve sifirlar; ayni istek iki kez tuketilmez.
    pub fn take_pair_prompt(&self) -> bool {
        self.pair_prompt.swap(false, Ordering::Relaxed)
    }
}
