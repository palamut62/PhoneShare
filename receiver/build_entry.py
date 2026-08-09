"""PyInstaller giris noktasi.

Dogrudan src/phoneshare_receiver/__main__.py'yi isaret etmek onefile'da
"attempted relative import with no known parent package" hatasina yol acar
(paket baglamlari tek script olarak bundle edilirken kaybolur). Bu wrapper
paketi normal import yoluyla yukler.
"""

from phoneshare_receiver.__main__ import main

if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
