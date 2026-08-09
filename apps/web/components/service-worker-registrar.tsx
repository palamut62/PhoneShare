"use client";

import { useEffect } from "react";

/** PRD §11 — uygulama kabugu Service Worker ile onbellege alinir. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
      // Guvenli olmayan origin'de SW kaydi yapilamaz; uygulama yine de calisir.
      return;
    }
    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Kayit basarisiz olursa uygulama cevrimici modda calismaya devam eder.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
