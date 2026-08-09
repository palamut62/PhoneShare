// PhoneShare desktop: web static ciktisini (apps/web/out) apps/desktop/dist'e kopyalar.
// Tauri frontendDist: ../dist  ->  src-tauri'ye gore dist.
import { cpSync, rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(desktopRoot, "../web/out");
const dest = resolve(desktopRoot, "dist");

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`copied ${src} -> ${dest}`);
