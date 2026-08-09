/**
 * PC paneli mi, telefon mu? (PRD §12)
 *
 * `isTauri()` tek basina YETERSIZ: receiver PWA'yi ayni zamanda tarayiciya da
 * (`http://127.0.0.1:8765/`) sunar ve orada da eslestirme girisi gorunmelidir.
 * Karar, receiver'in `GET /api/health` -> `is_local_client` cevabina dayanir;
 * bu deger gercek soket adresinden turetildigi icin telefon tarafindan spoof edilemez.
 */
export function isLocalPanel(options: {
  isTauriShell: boolean;
  isLocalClient: boolean;
}): boolean {
  return options.isTauriShell || options.isLocalClient;
}

export type ShellView = "loading" | "local-panel" | "pairing" | "app";

/**
 * Kabuk hangi ekrani gostermeli?
 * - Oturum varsa uygulama.
 * - Oturum yoksa ve burasi PC paneli ise: eslestirme kodu URETME ekrani
 *   ("Yeni Telefon Ekle"). PC bir telefon degildir, kod GIRMEZ.
 * - Oturum yoksa ve burasi telefon ise: klasik eslestirme (kod girme) ekrani.
 */
export function resolveShellView(options: {
  ready: boolean;
  hasSession: boolean;
  isTauriShell: boolean;
  isLocalClient: boolean;
}): ShellView {
  if (!options.ready) return "loading";
  if (options.hasSession) return "app";
  return isLocalPanel(options) ? "local-panel" : "pairing";
}
