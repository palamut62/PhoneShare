//! PhoneShare masaustu kabugu calistirilabiliri.
//!
//! Tum mantik `phoneshare_desktop_lib` kutuphanesinde (`src/lib.rs`); bu dosya
//! yalnizca `run()` girisini cagirir. Release derlemesinde konsol penceresi
//! acilmaz (Windows subsystem); debug'da loglar gorunur.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    phoneshare_desktop_lib::run()
}
