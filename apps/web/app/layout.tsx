import type { Metadata, Viewport } from "next";

import { AppProviders } from "@/components/app-providers";
import { AppShell } from "@/components/app-shell";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";

import "./globals.css";

export const metadata: Metadata = {
  title: "PhoneShare",
  description:
    "Send files from your phone directly to folders on your Windows computer. No cloud required.",
  manifest: "/manifest.webmanifest",
  applicationName: "PhoneShare",
  appleWebApp: {
    capable: true,
    title: "PhoneShare",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1020" },
  ],
};

/** Tema, React hidrasyonundan once uygulanir (flash onlenir). */
const themeBootstrap = `(function(){try{var t=localStorage.getItem("phoneshare.theme")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light");}catch(e){}})();`;

/**
 * Beyaz ekran tuzagi: React hic mount olamazsa (eski Safari'de desteklenmeyen
 * sozdizimi, yuklenemeyen chunk, erken hata) kullanici bos beyaz sayfa yerine
 * ne oldugunu ve cihaz bilgisini gorur. Boylece sorun raporlanabilir olur.
 * Uygulama basariyla acilirsa panel kendini siler.
 */
const crashTrap = `(function(){
var shown=false;
function show(title,detail){
  if(shown)return;shown=true;
  try{
    var d=document.createElement("div");
    d.id="phoneshare-crash";
    d.setAttribute("style","position:fixed;inset:0;z-index:2147483647;overflow:auto;padding:16px;background:#0b1020;color:#e6e9f0;font:14px/1.5 -apple-system,system-ui,sans-serif;-webkit-user-select:text;user-select:text");
    var ua=navigator.userAgent;
    d.innerHTML='<h1 style="font-size:17px;margin:0 0 8px">Uygulama acilamadi</h1>'
      +'<p style="opacity:.8;margin:0 0 12px">Asagidaki bilgiyi kopyalayip iletin.</p>'
      +'<pre style="white-space:pre-wrap;word-break:break-word;background:#151b2e;padding:12px;border-radius:8px;margin:0">'
      +[title,detail,"","UA: "+ua,"secureContext: "+window.isSecureContext,"origin: "+location.origin].join("\\n")
        .replace(/[<>&]/g,function(c){return {"<":"&lt;",">":"&gt;","&":"&amp;"}[c]})
      +'</pre>';
    (document.body||document.documentElement).appendChild(d);
  }catch(e){}
}
window.addEventListener("error",function(e){
  if(e && e.target && e.target !== window && e.target.src){show("A file could not be loaded",String(e.target.src));return;}
  show("Hata", (e && e.message ? e.message : "bilinmeyen")+" @ "+(e && e.filename ? e.filename+":"+e.lineno : "?"));
},true);
window.addEventListener("unhandledrejection",function(e){
  var r=e&&e.reason;show("Islenmemis hata", r&&r.message?r.message:String(r));
});
setTimeout(function(){
  var root=document.body;
  var empty=!root||!root.textContent||!root.textContent.trim();
  if(empty)show("Sayfa bos kaldi","React 12 saniye icinde baslamadi.");
},12000);
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="PhoneShare" />
        <script dangerouslySetInnerHTML={{ __html: crashTrap }} />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-dvh antialiased">
        {/* Kabuk (navigasyon + eslestirme kapisi) TEK yerde durur: sekme
            gecisinde yeniden mount edilmez, durum ve sorgu onbellegi korunur. */}
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
