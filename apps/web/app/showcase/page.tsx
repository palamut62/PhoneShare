"use client";

import {
  ArrowUpRight,
  CheckCircle2,
  FolderPlus,
  Laptop,
  Maximize2,
  Minimize2,
  Monitor,
  Moon,
  Pause,
  Play,
  QrCode,
  RefreshCw,
  Smartphone,
  Sun,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

type ViewMode = "sim" | "gallery";
type PlatformMode = "mobile" | "desktop";
type MobileScreenId = "m1" | "m2" | "m3" | "m4" | "m5";
type DesktopScreenId = "d1" | "d2" | "d3" | "d4" | "d5";

export default function ShowcasePage() {
  const [viewMode, setViewMode] = React.useState<ViewMode>("sim");
  const [platform, setPlatform] = React.useState<PlatformMode>("mobile");
  const [mobileScreen, setMobileScreen] = React.useState<MobileScreenId>("m1");
  const [desktopScreen, setDesktopScreen] = React.useState<DesktopScreenId>("d1");
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");
  const [frameView, setFrameView] = React.useState(true);

  // Transfer simülatörü durumu
  const [transferProgress, setTransferProgress] = React.useState(68);
  const [isTransferring, setIsTransferring] = React.useState(true);
  const [pinCode, setPinCode] = React.useState("482-193");
  const [pinTimer, setPinTimer] = React.useState(284);
  const [enteredPin, setEnteredPin] = React.useState("482193");

  // Transfer ilerleme animasyonu simülatörü
  React.useEffect(() => {
    if (!isTransferring) return;
    const interval = setInterval(() => {
      setTransferProgress((prev) => (prev >= 100 ? 0 : prev + 2));
    }, 400);
    return () => clearInterval(interval);
  }, [isTransferring]);

  // Eşleştirme PIN sayacı
  React.useEffect(() => {
    const timer = setInterval(() => {
      setPinTimer((prev) => (prev > 0 ? prev - 1 : 300));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const pressNumpad = (digit: string) => {
    if (enteredPin.length < 6) {
      setEnteredPin((prev) => prev + digit);
    }
  };

  const deleteNumpad = () => {
    setEnteredPin((prev) => prev.slice(0, -1));
  };

  const regeneratePin = () => {
    const code = `${Math.floor(100 + Math.random() * 900)}-${Math.floor(
      100 + Math.random() * 900
    )}`;
    setPinCode(code);
    setPinTimer(300);
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-200 ${
        theme === "dark" ? "bg-[#090a10] text-zinc-100" : "bg-zinc-100 text-zinc-900"
      }`}
    >
      {/* ========================================================================= */}
      {/* 1. ÜST BAŞLIK & KONTROL ÇUBUĞU */}
      {/* ========================================================================= */}
      <header
        className={`sticky top-0 z-50 border-b backdrop-blur-md px-4 py-3 sm:px-8 flex flex-wrap items-center justify-between gap-4 ${
          theme === "dark"
            ? "border-zinc-800 bg-[#0d0e15]/90 text-zinc-200"
            : "border-zinc-200 bg-white/90 text-zinc-800"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black shadow-lg shadow-blue-500/25">
            PS
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight">PhoneShare UI Tasarım Galerisi</h1>
              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-500 border border-blue-500/20">
                5 Mobil + 5 Masaüstü
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              10 Tamamen Bağımsız ve Farklı Kullanım Senaryosuna Sahip Arayüz Takımı
            </p>
          </div>
        </div>

        {/* Görünüm & Mod Seçicileri */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Görünüm Biçimi Toggle: Simülatör vs Galeri */}
          <div
            className={`flex items-center rounded-xl p-1 border ${
              theme === "dark" ? "bg-zinc-900 border-zinc-800" : "bg-zinc-200/80 border-zinc-300"
            }`}
          >
            <button
              type="button"
              onClick={() => setViewMode("sim")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "sim"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>Simülatör</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("gallery")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "gallery"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Monitor className="h-3.5 w-3.5" />
              <span>Tümünü Gör (Galeri)</span>
            </button>
          </div>

          {/* Simülatördeyken Mobil / Masaüstü Değiştirici */}
          {viewMode === "sim" && (
            <div
              className={`flex items-center rounded-xl p-1 border ${
                theme === "dark" ? "bg-zinc-900 border-zinc-800" : "bg-zinc-200/80 border-zinc-300"
              }`}
            >
              <button
                type="button"
                onClick={() => setPlatform("mobile")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  platform === "mobile"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                5 Mobil
              </button>
              <button
                type="button"
                onClick={() => setPlatform("desktop")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  platform === "desktop"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                5 Masaüstü
              </button>
            </div>
          )}

          {/* Çerçeve Aç/Kapa (Yalnızca Simülatörde) */}
          {viewMode === "sim" && (
            <button
              type="button"
              onClick={() => setFrameView(!frameView)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                theme === "dark"
                  ? "border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300"
                  : "border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700"
              }`}
            >
              {frameView ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{frameView ? "Çerçeveli" : "Geniş"}</span>
            </button>
          )}

          {/* Tema Değiştirici */}
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={`p-1.5 rounded-lg border transition-colors ${
              theme === "dark"
                ? "border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-amber-400"
                : "border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700"
            }`}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <Link
            href="/"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              theme === "dark"
                ? "border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300"
                : "border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700"
            }`}
          >
            Ana Uygulama →
          </Link>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. SİMÜLATÖR EKRAN SEÇİM ŞERİDİ */}
      {/* ========================================================================= */}
      {viewMode === "sim" && (
        <div
          className={`border-b px-4 sm:px-8 py-2 flex items-center gap-2 overflow-x-auto text-xs ${
            theme === "dark" ? "border-zinc-800/80 bg-zinc-950/50" : "border-zinc-200 bg-white/50"
          }`}
        >
          <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[11px] whitespace-nowrap mr-2">
            {platform === "mobile" ? "Mobil Arayüzler:" : "Masaüstü Arayüzler:"}
          </span>

          {platform === "mobile" ? (
            <>
              <ScreenTabBtn
                active={mobileScreen === "m1"}
                onClick={() => setMobileScreen("m1")}
                label="Mobil 1: Radar Hızlı Paylaşım"
                badge="AirDrop"
              />
              <ScreenTabBtn
                active={mobileScreen === "m2"}
                onClick={() => setMobileScreen("m2")}
                label="Mobil 2: Saha / Şantiye Kamerası"
                badge="Vizör"
              />
              <ScreenTabBtn
                active={mobileScreen === "m3"}
                onClick={() => setMobileScreen("m3")}
                label="Mobil 3: Chunk HUD & Dynamic Island"
                badge="Canlı HUD"
              />
              <ScreenTabBtn
                active={mobileScreen === "m4"}
                onClick={() => setMobileScreen("m4")}
                label="Mobil 4: Medya Stüdyosu & İsimlendirme"
                badge="Staging"
              />
              <ScreenTabBtn
                active={mobileScreen === "m5"}
                onClick={() => setMobileScreen("m5")}
                label="Mobil 5: Dokunmatik Numpad & Kasa"
                badge="PIN"
              />
            </>
          ) : (
            <>
              <ScreenTabBtn
                active={desktopScreen === "d1"}
                onClick={() => setDesktopScreen("d1")}
                label="Masaüstü 1: Win 11 Sistem Tepsisi"
                badge="360px Tray"
              />
              <ScreenTabBtn
                active={desktopScreen === "d2"}
                onClick={() => setDesktopScreen("d2")}
                label="Masaüstü 2: Pro Command Center"
                badge="3 Kolon"
              />
              <ScreenTabBtn
                active={desktopScreen === "d3"}
                onClick={() => setDesktopScreen("d3")}
                label="Masaüstü 3: Sanal Klasör & Depolama"
                badge="Explorer"
              />
              <ScreenTabBtn
                active={desktopScreen === "d4"}
                onClick={() => setDesktopScreen("d4")}
                label="Masaüstü 4: Görsel Kural Stüdyosu"
                badge="Automation"
              />
              <ScreenTabBtn
                active={desktopScreen === "d5"}
                onClick={() => setDesktopScreen("d5")}
                label="Masaüstü 5: Güvenlik & Audit Kulesi"
                badge="Security"
              />
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ANA ALAN: SİMÜLATÖR VEYA GALERİ */}
      {/* ========================================================================= */}
      {viewMode === "sim" ? (
        <main className="p-4 sm:p-8 flex justify-center items-start min-h-[calc(100vh-120px)]">
          {platform === "mobile" ? (
            /* MOBIL ÇERÇEVE */
            <div
              className={`w-full transition-all duration-300 ${
                frameView
                  ? "max-w-[420px] rounded-[52px] p-3 shadow-2xl border-[8px] border-zinc-800 bg-zinc-950 relative overflow-hidden ring-1 ring-zinc-700/50"
                  : "max-w-xl mx-auto"
              }`}
            >
              {/* Dynamic Island */}
              {frameView && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-full z-40 flex items-center justify-between px-3">
                  <div className="h-2 w-2 rounded-full bg-zinc-800" />
                  <div className="flex items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] text-zinc-400 font-mono">PS</span>
                  </div>
                </div>
              )}

              {/* iPhone Ekran Gövdesi */}
              <div
                className={`w-full min-h-[760px] rounded-[40px] flex flex-col overflow-hidden text-sm relative select-none ${
                  theme === "dark" ? "bg-[#12131a] text-zinc-100" : "bg-[#f2f2f7] text-zinc-900"
                }`}
              >
                {/* iOS Üst Bar */}
                <div
                  className={`pt-8 px-6 pb-2 flex items-center justify-between text-xs font-medium ${
                    theme === "dark" ? "text-zinc-400" : "text-zinc-600"
                  }`}
                >
                  <span>09:41</span>
                  <div className="flex items-center gap-1.5">
                    <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-[11px] font-bold">5G</span>
                    <div className="w-5 h-2.5 border border-current rounded-sm p-0.5 flex items-center">
                      <div className="w-full h-full bg-emerald-500 rounded-2xs" />
                    </div>
                  </div>
                </div>

                {/* Mobil Ekran İçerikleri */}
                <div className="flex-1 overflow-y-auto px-4 pb-20 pt-2">
                  {mobileScreen === "m1" && (
                    <MobileRadarScreen theme={theme} onSend={() => setMobileScreen("m3")} />
                  )}
                  {mobileScreen === "m2" && (
                    <MobileCameraScreen theme={theme} onCapture={() => setMobileScreen("m3")} />
                  )}
                  {mobileScreen === "m3" && (
                    <MobileChunkHudScreen
                      theme={theme}
                      progress={transferProgress}
                      isTransferring={isTransferring}
                      setIsTransferring={setIsTransferring}
                    />
                  )}
                  {mobileScreen === "m4" && (
                    <MobileBatchStagingScreen theme={theme} onStart={() => setMobileScreen("m3")} />
                  )}
                  {mobileScreen === "m5" && (
                    <MobileNumpadScreen
                      theme={theme}
                      enteredPin={enteredPin}
                      onPress={pressNumpad}
                      onDelete={deleteNumpad}
                      onSubmit={() => setMobileScreen("m1")}
                    />
                  )}
                </div>

                {/* Mobil Alt Menü */}
                <div
                  className={`absolute bottom-0 inset-x-0 border-t backdrop-blur-lg px-2 py-2 flex items-center justify-around z-30 text-[10px] ${
                    theme === "dark"
                      ? "border-zinc-800/80 bg-[#12131a]/90 text-zinc-400"
                      : "border-zinc-200/80 bg-white/90 text-zinc-500"
                  }`}
                >
                  <MobileNavTab active={mobileScreen === "m1"} onClick={() => setMobileScreen("m1")} label="Radar" />
                  <MobileNavTab active={mobileScreen === "m2"} onClick={() => setMobileScreen("m2")} label="Saha" />
                  <MobileNavTab active={mobileScreen === "m3"} onClick={() => setMobileScreen("m3")} label="HUD" />
                  <MobileNavTab active={mobileScreen === "m4"} onClick={() => setMobileScreen("m4")} label="Medya" />
                  <MobileNavTab active={mobileScreen === "m5"} onClick={() => setMobileScreen("m5")} label="PIN" />
                </div>

                {/* Home Indicator */}
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-32 h-1 bg-zinc-500/40 rounded-full pointer-events-none" />
              </div>
            </div>
          ) : (
            /* MASAÜSTÜ SEÇİLEN EKRAN (5 Farklı Masaüstü Form Faktörü) */
            <div className="w-full max-w-5xl transition-all duration-300">
              {desktopScreen === "d1" && <DesktopTrayFlyoutScreen theme={theme} />}
              {desktopScreen === "d2" && <DesktopProCommandScreen theme={theme} />}
              {desktopScreen === "d3" && <DesktopStorageExplorerScreen theme={theme} />}
              {desktopScreen === "d4" && <DesktopVisualRuleScreen theme={theme} />}
              {desktopScreen === "d5" && (
                <DesktopSecurityTerminalScreen
                  theme={theme}
                  pinCode={pinCode}
                  pinTimer={pinTimer}
                  formatSeconds={formatSeconds}
                  onRegenerate={regeneratePin}
                />
              )}
            </div>
          )}
        </main>
      ) : (
        /* ========================================================================= */
        /* 4. TÜMÜNÜ GÖR (GALERİ MODU) */
        /* ========================================================================= */
        <section className="p-6 sm:p-10 space-y-12 max-w-7xl mx-auto">
          {/* 5 MASAÜSTÜ ARAYÜZÜ BİR ARADA */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                5 Farklı Masaüstü Arayüz Takımı (Windows Receiver)
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                5 Benzersiz Form Faktörü
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <GalleryCard
                theme={theme}
                title="Masaüstü 1: Windows 11 Sistem Tepsisi (Tray Companion)"
                tag="360px Kompakt"
                desc="Windows görev çubuğunun sağ altından açılan hafif akrilik pencere. Hızlı bağlantı durumu, son transferi açma ve tek tıkla klasör erişimi."
              >
                <div className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800 text-xs flex justify-between items-center">
                  <span>Umut’un iPhone’u (Bağlı)</span>
                  <span className="text-emerald-400 font-bold">18.4 MB/s</span>
                </div>
              </GalleryCard>

              <GalleryCard
                theme={theme}
                title="Masaüstü 2: Pro Receiver Command Center"
                tag="3 Kolonlu Dashboard"
                desc="FastAPI & SQLite telemetrisi (Port, RAM, Uptime), ortada canlı WebSocket bant genişliği eğrisi ve bağlı cihaz canlı telemetrisi."
              >
                <div className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800 text-xs flex justify-between items-center">
                  <span>Port: 8765 • LAN: 192.168.1.45</span>
                  <span className="text-blue-400 font-mono">Bugün: 1.82 GB</span>
                </div>
              </GalleryCard>

              <GalleryCard
                theme={theme}
                title="Masaüstü 3: Sanal Hedef Klasör Gezgini"
                tag="Storage Explorer"
                desc="Sanal hedeflerin Windows fiziksel dizinlerine eşlenmesi, disk doluluk barları ve Windows Gezgini ile doğrudan entegrasyon."
              >
                <div className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800 text-xs flex justify-between items-center">
                  <span>Akpazar → D:\DSI\Projeler\Akpazar</span>
                  <span className="text-amber-400 font-bold">Boş: 180 GB</span>
                </div>
              </GalleryCard>

              <GalleryCard
                theme={theme}
                title="Masaüstü 4: Görsel Kural & Otomasyon Stüdyosu"
                tag="Visual Rule Builder"
                desc="Gelen dosyaları uzantı ve MIME tipine göre otomatik filtreleyen, şablonlu adlandıran ve çakışma politikasını yöneten blok stüdyosu."
              >
                <div className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800 text-xs flex justify-between items-center">
                  <span>PDF → Belgeler ({`{date}_{original}`})</span>
                  <span className="text-purple-400">Yeni İsim (1)</span>
                </div>
              </GalleryCard>

              <GalleryCard
                theme={theme}
                title="Masaüstü 5: Güvenlik, Eşleştirme & Audit Kulesi"
                tag="Security Terminal"
                desc="Dinamik 5 dakikalık QR ve 6 haneli kod üreteci, yetkili cihaz token yönetimi ve akan güvenlik denetim (audit) log konsolu."
                className="lg:col-span-2"
              >
                <div className="p-3 rounded-2xl bg-black/90 font-mono text-[11px] text-zinc-400 space-y-1">
                  <p className="text-emerald-400">✓ 09:41:22 [AUTH] iPhone doğrulandı.</p>
                  <p className="text-blue-400">✓ 09:41:35 [CHUNK] 8 MB part_1 SHA-256 doğrulandı.</p>
                </div>
              </GalleryCard>
            </div>
          </div>

          {/* 5 MOBİL ARAYÜZÜ BİR ARADA */}
          <div className="space-y-4 pt-6 border-t border-zinc-800">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                5 Farklı Mobil Arayüz Takımı (iPhone Safari / PWA)
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                5 Ayrı Kullanım Deneyimi
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <MiniCard
                theme={theme}
                num="1"
                title="Radar Hızlı Paylaşım"
                desc="AirDrop stili dairesel dalgalar, tek kaydırmayla hızlı aktarım."
              />
              <MiniCard
                theme={theme}
                num="2"
                title="Saha Kamera Vizörü"
                desc="Şantiye için tam ekran vizör, GPS filigranı ve tek tıkla yükleme."
              />
              <MiniCard
                theme={theme}
                num="3"
                title="Chunk HUD & Island"
                desc="8 MB'lık canlı dolan parçalar, anlık MB/s ve SHA-256 mührü."
              />
              <MiniCard
                theme={theme}
                num="4"
                title="Medya & Toplu İsim"
                desc="Şablonlu adlandırma canlı önizlemesi ve toplu dosya hazırlığı."
              />
              <MiniCard
                theme={theme}
                num="5"
                title="Dokunmatik Numpad"
                desc="0-9 dokunmatik iOS tuş takımı ve güvenli 6 haneli kod girişi."
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/* =========================================================================
   MOBİL EKRANLAR (5 AYRI KONSEPT)
   ========================================================================= */

/** Mobil 1: AirDrop / Radar Tarzı Hızlı Paylaşım */
function MobileRadarScreen({ theme, onSend }: { theme: "dark" | "light"; onSend: () => void }) {
  return (
    <div className="flex flex-col justify-between min-h-[580px]">
      <div className="text-center pt-2">
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">
          Mobil 1 • Radar Share
        </span>
        <h2 className="text-base font-bold text-foreground mt-1">AirDrop Stili Yerel Ağ Radarı</h2>
        <p className="text-xs text-zinc-400">Yakındaki receiver bilgisayar otomatik keşfedildi</p>
      </div>

      {/* Radar Dairesel Dalga Sahnesi */}
      <div className="relative w-56 h-56 mx-auto flex items-center justify-center my-4">
        <div className="absolute inset-0 rounded-full border border-blue-500/20 animate-ping opacity-30" />
        <div className="absolute inset-6 rounded-full border border-indigo-500/30 animate-pulse" />
        <div className="absolute inset-12 rounded-full border border-cyan-500/40" />

        {/* Merkezdeki Bilgisayar Düğmesi */}
        <button
          type="button"
          onClick={onSend}
          className="relative z-10 p-4 rounded-3xl bg-gradient-to-b from-blue-600 to-indigo-700 text-white text-center shadow-2xl shadow-blue-500/40 border border-blue-400/40 cursor-pointer active:scale-95 transition-transform"
        >
          <Laptop className="h-8 w-8 mx-auto" />
          <div className="text-xs font-bold mt-1">UMUT-PC</div>
          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500 text-white">
            Çevrimiçi
          </span>
        </button>
      </div>

      {/* Swipe to Send Kartı */}
      <div
        className={`p-4 rounded-2xl border space-y-3 backdrop-blur-md ${
          theme === "dark" ? "border-zinc-800 bg-zinc-900/80" : "border-zinc-200 bg-white"
        }`}
      >
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400">Hedef Klasör:</span>
          <span className="font-bold text-blue-500">★ Akpazar Projesi</span>
        </div>
        <button
          type="button"
          onClick={onSend}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-xl shadow-blue-600/30 flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <span>Yukarı Kaydır / Hızlı Gönder</span>
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** Mobil 2: Saha / Şantiye Kamerası Vizörü */
function MobileCameraScreen({ onCapture }: { theme: "dark" | "light"; onCapture: () => void }) {
  return (
    <div className="flex flex-col justify-between min-h-[580px]">
      <div className="flex justify-between items-center text-xs">
        <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold text-[10px] border border-rose-500/30">
          Mobil 2 • Saha Vizörü
        </span>
        <span className="text-zinc-400 font-mono text-[11px]">GPS: 39.02° N, 39.54° E</span>
      </div>

      {/* Vizör Kutusu */}
      <div className="relative w-full h-[330px] rounded-3xl border-2 border-zinc-700/80 bg-zinc-950 overflow-hidden flex flex-col justify-between p-3 my-2 shadow-inner">
        {/* Üst Filigran */}
        <div className="relative z-10 flex justify-between items-center text-[10px] font-mono text-zinc-300 bg-black/60 backdrop-blur px-2.5 py-1 rounded-lg">
          <span>PROJE: AKPAZAR HES</span>
          <span className="text-amber-400">2026-09-06 09:41</span>
        </div>

        {/* Merkez Odak Noktası */}
        <div className="relative z-10 m-auto h-16 w-16 border-2 border-dashed border-amber-400/80 rounded-xl flex items-center justify-center">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        </div>

        {/* Alt Hızlı Etiket */}
        <div className="relative z-10 bg-black/70 backdrop-blur-md p-2 rounded-xl text-xs flex justify-between items-center">
          <span className="text-zinc-300">
            Etiket: <strong className="text-blue-400">Kazı İlerlemesi #4</strong>
          </span>
          <span className="text-[10px] text-emerald-400 font-bold">Hazır</span>
        </div>
      </div>

      {/* Deklanşör */}
      <div className="space-y-2">
        <div className="flex justify-center items-center gap-6">
          <button type="button" className="h-10 w-10 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs font-bold">
            1x
          </button>
          <button
            type="button"
            onClick={onCapture}
            className="h-16 w-16 rounded-full border-4 border-white bg-rose-600 hover:bg-rose-500 shadow-xl shadow-rose-600/40 active:scale-90 transition-transform"
          />
          <button type="button" className="h-10 w-10 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs">
            HDR
          </button>
        </div>
        <p className="text-center text-[11px] text-zinc-400">
          Fotoğraf doğrudan PC&apos;de <strong className="text-blue-400">D:\DSI\Projeler\Akpazar</strong> dizinine iletilir.
        </p>
      </div>
    </div>
  );
}

/** Mobil 3: Canlı Chunk HUD & Dinamik Ada */
function MobileChunkHudScreen({
  theme,
  progress,
  isTransferring,
  setIsTransferring,
}: {
  theme: "dark" | "light";
  progress: number;
  isTransferring: boolean;
  setIsTransferring: (b: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center text-xs">
        <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-bold text-[10px] border border-indigo-500/30">
          Mobil 3 • Chunk HUD
        </span>
        <span className="font-mono text-emerald-500 font-bold">18.4 MB/s</span>
      </div>

      {/* Dynamic Island HUD */}
      <div className="p-4 rounded-3xl bg-black text-white border border-zinc-800 space-y-3 shadow-2xl">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-600 font-bold text-xs flex items-center justify-center">
              PDF
            </div>
            <div>
              <h4 className="text-xs font-bold">Akpazar_Jeoteknik_Rapor.pdf</h4>
              <p className="text-[10px] text-zinc-400">24.8 MB • Parça 3/4</p>
            </div>
          </div>
          <span className="text-sm font-black text-blue-400 font-mono">%{progress}</span>
        </div>

        <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 4 Chunk Blok Dağılımı */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-zinc-400">8 MB Chunk Blok Dağılımı:</span>
        <div className="grid grid-cols-4 gap-2">
          <div className="p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-center text-xs">
            <span className="text-[10px] font-mono font-bold text-emerald-400">Chunk 1</span>
            <p className="text-[9px] text-zinc-400 mt-0.5">8 MB ✓</p>
          </div>
          <div className="p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-center text-xs">
            <span className="text-[10px] font-mono font-bold text-emerald-400">Chunk 2</span>
            <p className="text-[9px] text-zinc-400 mt-0.5">8 MB ✓</p>
          </div>
          <div className="p-2.5 rounded-xl border border-blue-500/40 bg-blue-500/15 text-center text-xs animate-pulse">
            <span className="text-[10px] font-mono font-bold text-blue-400">Chunk 3</span>
            <p className="text-[9px] text-blue-300 mt-0.5">Akıyor...</p>
          </div>
          <div className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/40 text-center text-xs opacity-50">
            <span className="text-[10px] font-mono text-zinc-400">Chunk 4</span>
            <p className="text-[9px] text-zinc-500 mt-0.5">0.8 MB</p>
          </div>
        </div>
      </div>

      {/* SHA-256 Rozeti */}
      <div
        className={`p-3 rounded-2xl border text-xs space-y-1 ${
          theme === "dark" ? "border-zinc-800 bg-zinc-900/70" : "border-zinc-200 bg-white"
        }`}
      >
        <div className="flex justify-between items-center">
          <span className="text-zinc-400">SHA-256 Bütünlük:</span>
          <span className="text-emerald-500 font-bold flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            DOĞRULANDI
          </span>
        </div>
        <p className="text-[10px] font-mono text-zinc-500 truncate">
          e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        </p>
      </div>

      {/* Kontrol Butonları */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={() => setIsTransferring(!isTransferring)}
          className="py-2.5 rounded-xl border border-zinc-700 bg-zinc-800 text-xs font-semibold text-zinc-300 flex items-center justify-center gap-1.5"
        >
          {isTransferring ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          <span>{isTransferring ? "Duraklat" : "Devam"}</span>
        </button>
        <button
          type="button"
          className="py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs font-semibold text-rose-400"
        >
          İptal Et
        </button>
      </div>
    </div>
  );
}

/** Mobil 4: Medya Stüdyosu & Toplu İsimlendirme */
function MobileBatchStagingScreen({ theme, onStart }: { theme: "dark" | "light"; onStart: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center text-xs">
        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px] border border-emerald-500/30">
          Mobil 4 • Batch Staging
        </span>
        <span className="text-zinc-400">3 Dosya Seçili</span>
      </div>

      <h3 className="text-base font-bold text-foreground">Toplu Dosya & Adlandırma</h3>

      <div className="space-y-2">
        <div
          className={`p-3 rounded-2xl border space-y-1.5 ${
            theme === "dark" ? "border-zinc-800 bg-zinc-900/80" : "border-zinc-200 bg-white"
          }`}
        >
          <div className="flex justify-between text-xs">
            <span className="font-bold text-foreground">IMG_3847.jpg</span>
            <span className="text-zinc-400 font-mono">5.2 MB</span>
          </div>
          <div className="p-2 rounded-xl bg-zinc-950/40 border border-zinc-800/80 text-[11px] flex justify-between items-center">
            <span className="text-zinc-400">Hedef Ad:</span>
            <code className="text-blue-500 font-mono">2026-09-06_IMG_3847.jpg</code>
          </div>
        </div>

        <div
          className={`p-3 rounded-2xl border space-y-1.5 ${
            theme === "dark" ? "border-zinc-800 bg-zinc-900/80" : "border-zinc-200 bg-white"
          }`}
        >
          <div className="flex justify-between text-xs">
            <span className="font-bold text-foreground">tutanak_imzali.pdf</span>
            <span className="text-zinc-400 font-mono">4.8 MB</span>
          </div>
          <div className="p-2 rounded-xl bg-zinc-950/40 border border-zinc-800/80 text-[11px] flex justify-between items-center">
            <span className="text-zinc-400">Kural:</span>
            <span className="text-emerald-500 font-medium">Belgeler & Hakediş Klasörü</span>
          </div>
        </div>

        <div
          className={`p-3 rounded-2xl border space-y-1.5 ${
            theme === "dark" ? "border-zinc-800 bg-zinc-900/80" : "border-zinc-200 bg-white"
          }`}
        >
          <div className="flex justify-between text-xs">
            <span className="font-bold text-foreground">kesit_cizim_kat1.dwg</span>
            <span className="text-zinc-400 font-mono">12.4 MB</span>
          </div>
          <div className="p-2 rounded-xl bg-zinc-950/40 border border-zinc-800/80 text-[11px] flex justify-between items-center">
            <span className="text-zinc-400">Hedef:</span>
            <span className="text-blue-500 font-medium">Akpazar Projesi</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onStart}
        className="w-full py-3.5 rounded-2xl bg-blue-600 text-white font-bold text-xs shadow-xl shadow-blue-600/30 active:scale-95 transition-all"
      >
        Toplu Gönderimi Başlat (22.4 MB) →
      </button>
    </div>
  );
}

/** Mobil 5: Dokunmatik Numpad & Güvenli Kasa */
function MobileNumpadScreen({
  theme,
  enteredPin,
  onPress,
  onDelete,
  onSubmit,
}: {
  theme: "dark" | "light";
  enteredPin: string;
  onPress: (digit: string) => void;
  onDelete: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col justify-between min-h-[580px]">
      <div className="text-center pt-2">
        <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold text-[10px] border border-cyan-500/30">
          Mobil 5 • Numpad Vault
        </span>
        <h3 className="text-base font-bold text-foreground mt-1">Eşleştirme PIN Kodu</h3>
        <p className="text-xs text-zinc-400">PC ekranında üretilen 6 haneli kodu girin</p>
      </div>

      {/* 6 Haneli PIN Kutuları */}
      <div className="flex justify-center gap-2 my-2">
        {[0, 1, 2, 3, 4, 5].map((idx) => (
          <React.Fragment key={idx}>
            {idx === 3 && <span className="text-zinc-500 self-center font-bold text-lg">-</span>}
            <div
              className={`w-9 h-12 rounded-xl border font-mono font-bold text-lg flex items-center justify-center ${
                theme === "dark"
                  ? "border-blue-500/50 bg-zinc-900 text-blue-400"
                  : "border-blue-300 bg-white text-blue-600 shadow-sm"
              }`}
            >
              {enteredPin[idx] || ""}
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Cam Dokunmatik Tuş Takımı */}
      <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto w-full my-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => onPress(num)}
            className={`h-14 rounded-2xl border text-lg font-bold active:scale-95 transition-all ${
              theme === "dark"
                ? "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-white"
                : "bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-800 shadow-sm"
            }`}
          >
            {num}
          </button>
        ))}
        <button
          type="button"
          className="h-14 rounded-2xl text-xs text-zinc-500 font-semibold flex items-center justify-center"
        >
          QR TARA
        </button>
        <button
          type="button"
          onClick={() => onPress("0")}
          className={`h-14 rounded-2xl border text-lg font-bold active:scale-95 transition-all ${
            theme === "dark"
              ? "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-white"
              : "bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-800 shadow-sm"
          }`}
        >
          0
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="h-14 rounded-2xl text-xs text-rose-500 font-semibold flex items-center justify-center active:scale-95"
        >
          SİL ⌫
        </button>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        className="w-full py-3.5 rounded-2xl bg-blue-600 text-white font-bold text-xs shadow-lg shadow-blue-600/30"
      >
        Doğrula ve Bağlan
      </button>
    </div>
  );
}

/* =========================================================================
   MASAÜSTÜ EKRANLARI (5 AYRI FORM FAKTÖRÜ)
   ========================================================================= */

/** Masaüstü 1: Windows 11 Sistem Tepsisi Mini Panel (360px Compact Tray) */
function DesktopTrayFlyoutScreen({ theme }: { theme: "dark" | "light" }) {
  return (
    <div
      className={`max-w-sm mx-auto rounded-3xl border shadow-2xl p-5 space-y-4 ${
        theme === "dark"
          ? "border-zinc-800 bg-[#141520]/95 text-zinc-100"
          : "border-zinc-200 bg-white/95 text-zinc-900"
      }`}
    >
      <div className="flex items-center justify-between pb-2 border-b border-zinc-700/20">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center">
            PS
          </div>
          <div>
            <h4 className="text-xs font-bold">PhoneShare Sistem Tepsisi</h4>
            <p className="text-[10px] text-zinc-400">Windows Tray Companion (PRD §8)</p>
          </div>
        </div>
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
      </div>

      <div
        className={`p-3 rounded-2xl border flex items-center justify-between ${
          theme === "dark" ? "border-zinc-800 bg-zinc-900/80" : "border-zinc-200 bg-zinc-50"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xs font-bold">Umut’un iPhone’u</span>
            <p className="text-[10px] text-emerald-500 font-medium">Bağlı • Wi-Fi LAN</p>
          </div>
        </div>
        <button type="button" className="text-[11px] text-blue-500 font-semibold">
          Ayır
        </button>
      </div>

      <div
        className={`p-3 rounded-2xl border space-y-2 ${
          theme === "dark" ? "border-zinc-800 bg-zinc-900/50" : "border-zinc-200 bg-zinc-50"
        }`}
      >
        <span className="text-[11px] font-semibold text-zinc-400">Son Gelen Dosya:</span>
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium truncate max-w-[200px]">Akpazar_Jeoteknik.pdf</span>
          <span className="text-zinc-400 font-mono">24.8 MB</span>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            className="flex-1 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-semibold"
          >
            Dosyayı Aç
          </button>
          <button
            type="button"
            className="flex-1 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-[11px]"
          >
            Klasörde Göster
          </button>
        </div>
      </div>
    </div>
  );
}

/** Masaüstü 2: Pro Receiver Command Center (3 Kolonlu Dashboard) */
function DesktopProCommandScreen({ theme }: { theme: "dark" | "light" }) {
  return (
    <div
      className={`rounded-3xl border p-6 space-y-6 shadow-2xl ${
        theme === "dark"
          ? "border-zinc-800 bg-[#101118] text-zinc-100"
          : "border-zinc-200 bg-white text-zinc-900"
      }`}
    >
      <div className="flex justify-between items-center pb-4 border-b border-zinc-700/20">
        <div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
            Masaüstü 2 • Pro Dashboard
          </span>
          <h3 className="text-lg font-bold mt-1">PhoneShare Pro Command Center</h3>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
          FastAPI Servisi Aktif (PID 4812)
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div
          className={`p-4 rounded-2xl border space-y-3 ${
            theme === "dark" ? "border-zinc-800 bg-zinc-900/50" : "border-zinc-200 bg-zinc-50"
          }`}
        >
          <span className="text-xs font-bold uppercase text-zinc-400">Receiver Telemetrisi</span>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-400">Port:</span>
              <span className="font-mono">8765</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Yerel Ağ:</span>
              <span className="font-mono text-blue-500">192.168.1.45</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Tailscale IP:</span>
              <span className="font-mono text-emerald-500">100.84.12.9</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Uptime:</span>
              <span className="font-mono">4 gün 12 saat</span>
            </div>
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border space-y-3 ${
            theme === "dark" ? "border-zinc-800 bg-zinc-900/50" : "border-zinc-200 bg-zinc-50"
          }`}
        >
          <span className="text-xs font-bold uppercase text-zinc-400">Canlı Aktarım Grafiği</span>
          <div className="text-center py-2">
            <div className="text-3xl font-black text-blue-500 font-mono">
              18.4 <span className="text-sm font-normal text-zinc-400">MB/s</span>
            </div>
            <p className="text-[11px] text-emerald-500 font-semibold mt-1">Wi-Fi 6 LAN Hızı</p>
          </div>
          <div className="h-2 w-full bg-zinc-700/20 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full" style={{ width: "72%" }} />
          </div>
          <p className="text-[11px] text-zinc-400 text-center">Aktif: 1 Dosya (Chunk 3/4)</p>
        </div>

        <div
          className={`p-4 rounded-2xl border space-y-3 ${
            theme === "dark" ? "border-zinc-800 bg-zinc-900/50" : "border-zinc-200 bg-zinc-50"
          }`}
        >
          <span className="text-xs font-bold uppercase text-zinc-400">Bağlı Cihaz Detayı</span>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600/20 text-blue-500 flex items-center justify-center font-bold">
              iOS
            </div>
            <div>
              <h5 className="text-xs font-bold">Umut’un iPhone’u</h5>
              <p className="text-[10px] text-zinc-400">Token: Yetkilendirildi</p>
            </div>
          </div>
          <div className="pt-2 border-t border-zinc-700/20 text-[11px] space-y-1 text-zinc-400">
            <div className="flex justify-between">
              <span>Bugün:</span>
              <strong className="text-foreground">38 Dosya</strong>
            </div>
            <div className="flex justify-between">
              <span>Aktarılan:</span>
              <strong className="text-foreground">1.82 GB</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Masaüstü 3: Sanal Klasör & Depolama Gezgini */
function DesktopStorageExplorerScreen({ theme }: { theme: "dark" | "light" }) {
  return (
    <div
      className={`rounded-3xl border p-6 space-y-6 shadow-2xl ${
        theme === "dark"
          ? "border-zinc-800 bg-[#101118] text-zinc-100"
          : "border-zinc-200 bg-white text-zinc-900"
      }`}
    >
      <div className="flex justify-between items-center pb-4 border-b border-zinc-700/20">
        <div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-500 border border-amber-500/30">
            Masaüstü 3 • Storage Map
          </span>
          <h3 className="text-lg font-bold mt-1">Sanal Klasör Gezgini & Disk Haritası</h3>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          <span>+ Yeni Klasör Eşle</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          className={`p-4 rounded-2xl border space-y-2 ${
            theme === "dark" ? "border-zinc-800 bg-zinc-900/60" : "border-zinc-200 bg-zinc-50"
          }`}
        >
          <div className="flex justify-between">
            <div>
              <h4 className="text-sm font-bold">Akpazar Projesi</h4>
              <p className="text-xs font-mono text-zinc-400">D:\DSI\Projeler\Akpazar\</p>
            </div>
            <button type="button" className="text-xs text-blue-500 hover:underline">
              Gezginde Aç ↗
            </button>
          </div>
          <div className="pt-2 flex justify-between text-[11px] text-zinc-400">
            <span>Dolu: 42.8 GB</span>
            <span>Boş: 180 GB</span>
          </div>
          <div className="h-2 w-full bg-zinc-700/20 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full" style={{ width: "24%" }} />
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border space-y-2 ${
            theme === "dark" ? "border-zinc-800 bg-zinc-900/60" : "border-zinc-200 bg-zinc-50"
          }`}
        >
          <div className="flex justify-between">
            <div>
              <h4 className="text-sm font-bold">Fotoğraflar & Medya</h4>
              <p className="text-xs font-mono text-zinc-400">D:\Fotoğraflar\PhoneShare\</p>
            </div>
            <button type="button" className="text-xs text-blue-500 hover:underline">
              Gezginde Aç ↗
            </button>
          </div>
          <div className="pt-2 flex justify-between text-[11px] text-zinc-400">
            <span>Dolu: 128.4 GB</span>
            <span>Boş: 320 GB</span>
          </div>
          <div className="h-2 w-full bg-zinc-700/20 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: "40%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Masaüstü 4: Görsel Kural & Otomasyon Stüdyosu */
function DesktopVisualRuleScreen({ theme }: { theme: "dark" | "light" }) {
  return (
    <div
      className={`rounded-3xl border p-6 space-y-6 shadow-2xl ${
        theme === "dark"
          ? "border-zinc-800 bg-[#101118] text-zinc-100"
          : "border-zinc-200 bg-white text-zinc-900"
      }`}
    >
      <div className="flex justify-between items-center pb-4 border-b border-zinc-700/20">
        <div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
            Masaüstü 4 • Rule Builder
          </span>
          <h3 className="text-lg font-bold mt-1">Akıllı Kural & Yönlendirme Stüdyosu</h3>
        </div>
        <button
          type="button"
          className="px-3.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold"
        >
          + Yeni Kural Blok
        </button>
      </div>

      <div className="space-y-3">
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
            theme === "dark" ? "border-zinc-800 bg-zinc-900/60" : "border-zinc-200 bg-zinc-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-blue-600/20 text-blue-500 font-bold text-xs flex items-center justify-center">
              IF
            </div>
            <div>
              <span className="text-xs font-bold">Dosya uzantısı == .pdf</span>
              <p className="text-[11px] text-zinc-400">
                Hedef: <strong className="text-blue-500">Belgeler & Hakediş</strong> • Şablon:{" "}
                <code>{`{date}_{original}`}</code>
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
            Yeni İsim (1)
          </span>
        </div>

        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
            theme === "dark" ? "border-zinc-800 bg-zinc-900/60" : "border-zinc-200 bg-zinc-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-emerald-600/20 text-emerald-500 font-bold text-xs flex items-center justify-center">
              IF
            </div>
            <div>
              <span className="text-xs font-bold">MIME türü == image/* (.jpg, .png, .heic)</span>
              <p className="text-[11px] text-zinc-400">
                Hedef: <strong className="text-emerald-500">Fotoğraflar</strong> • Şablon:{" "}
                <code>{`{date}_IMG_{counter}`}</code>
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-purple-500 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">
            Sürümle (v2)
          </span>
        </div>
      </div>
    </div>
  );
}

/** Masaüstü 5: Güvenlik, Eşleştirme & Audit Kulesi */
function DesktopSecurityTerminalScreen({
  theme,
  pinCode,
  pinTimer,
  formatSeconds,
  onRegenerate,
}: {
  theme: "dark" | "light";
  pinCode: string;
  pinTimer: number;
  formatSeconds: (s: number) => string;
  onRegenerate: () => void;
}) {
  return (
    <div
      className={`rounded-3xl border p-6 space-y-6 shadow-2xl ${
        theme === "dark"
          ? "border-zinc-800 bg-[#101118] text-zinc-100"
          : "border-zinc-200 bg-white text-zinc-900"
      }`}
    >
      <div className="flex justify-between items-center pb-4 border-b border-zinc-700/20">
        <div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            Masaüstü 5 • Security Hub
          </span>
          <h3 className="text-lg font-bold mt-1">Cihaz Eşleştirme & Canlı Audit Günlüğü</h3>
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-500 text-xs font-semibold"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>PIN Yenile</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div
          className={`p-5 rounded-2xl border text-center space-y-3 ${
            theme === "dark" ? "border-zinc-800 bg-zinc-900/60" : "border-zinc-200 bg-zinc-50"
          }`}
        >
          <h4 className="text-sm font-bold">Yeni Telefon Eşleştir</h4>
          <div className="mx-auto w-36 h-36 bg-white rounded-2xl p-2 flex flex-col items-center justify-center border-4 border-zinc-900">
            <QrCode className="h-20 w-20 text-zinc-900" />
            <span className="text-[9px] font-mono text-zinc-900 font-bold">PS-{pinCode}</span>
          </div>
          <div className="inline-block px-4 py-2 rounded-xl bg-blue-600/20 text-blue-500 border border-blue-500/30 font-mono text-2xl font-black">
            {pinCode}
          </div>
          <p className="text-xs text-zinc-400">
            Süre: <strong className="text-amber-500 font-mono">{formatSeconds(pinTimer)}</strong>
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-zinc-800 bg-black/90 font-mono text-[11px] space-y-2 text-zinc-300">
          <span className="text-xs font-bold text-zinc-400">[CANLI GÜVENLİK GÜNLÜĞÜ]</span>
          <div className="space-y-1.5 text-zinc-400">
            <p className="text-emerald-400">09:41:22 [AUTH] Umut’un iPhone’u (192.168.1.102) doğrulandı.</p>
            <p className="text-blue-400">09:41:35 [CHUNK] 8 MB part_1 alındı (SHA-256 doğrulandı).</p>
            <p className="text-blue-400">09:41:38 [CHUNK] 8 MB part_2 alındı (SHA-256 doğrulandı).</p>
            <p className="text-amber-400">09:41:40 [TRAVERSAL] Path koruması devrede: Güvenli yol.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   YARDIMCI KÜÇÜK BİLEŞENLER
   ========================================================================= */

function ScreenTabBtn({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all ${
        active
          ? "bg-blue-600 text-white shadow-sm"
          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
      }`}
    >
      <span>{label}</span>
      {badge && (
        <span
          className={`text-[10px] px-1.5 py-0.2 rounded-md ${
            active ? "bg-white/20 text-white" : "bg-zinc-700/30 text-zinc-400"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function MobileNavTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 rounded-lg transition-colors ${
        active ? "text-blue-500 font-bold" : "hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function GalleryCard({
  theme,
  title,
  tag,
  desc,
  children,
  className = "",
}: {
  theme: "dark" | "light";
  title: string;
  tag: string;
  desc: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`p-5 rounded-3xl border space-y-3 ${
        theme === "dark" ? "border-zinc-800 bg-[#12131c]" : "border-zinc-200 bg-white shadow-sm"
      } ${className}`}
    >
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-bold text-foreground">{title}</h4>
        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 font-semibold border border-blue-500/20">
          {tag}
        </span>
      </div>
      <p className="text-xs text-zinc-400">{desc}</p>
      {children}
    </div>
  );
}

function MiniCard({
  theme,
  num,
  title,
  desc,
}: {
  theme: "dark" | "light";
  num: string;
  title: string;
  desc: string;
}) {
  return (
    <div
      className={`p-4 rounded-3xl border space-y-2 text-center ${
        theme === "dark" ? "border-zinc-800 bg-[#12131c]" : "border-zinc-200 bg-white shadow-sm"
      }`}
    >
      <div className="h-10 w-10 mx-auto rounded-xl bg-blue-600/15 text-blue-500 flex items-center justify-center font-bold text-sm">
        {num}
      </div>
      <h5 className="text-xs font-bold text-foreground">{title}</h5>
      <p className="text-[11px] text-zinc-400">{desc}</p>
    </div>
  );
}
