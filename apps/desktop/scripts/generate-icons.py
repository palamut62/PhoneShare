"""PhoneShare desktop ikon uretici.

- app-logo-1024.png : 1024x1024 ana logo (telefon -> bilgisayar dosya aktarimi)
- tray-offline.png  : 32x32 tray ikonu, durum noktasi gri
- tray-online.png   : 32x32 tray ikonu, durum noktasi yesil

Calistirma: receiver/.venv/Scripts/python.exe scripts/generate-icons.py
"""

from PIL import Image, ImageDraw

NAVY = (30, 58, 138)      # #1E3A8A
BLUE = (59, 130, 246)     # #3B82F6
SCREEN = (30, 64, 175)    # #1E40AF
WHITE = (255, 255, 255)
GRAY = (156, 163, 175)    # #9CA3AF offline
GREEN = (34, 197, 94)     # #22C55E online

BASE = r"C:\Users\umuti\Projects\web_depo\apps\desktop\src-tauri\icons"


def lerp(c1, c2, t):
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(3))


def gradient_image(size, top, bottom):
    img = Image.new("RGBA", (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        c = lerp(top, bottom, t) + (255,)
        for x in range(size):
            px[x, y] = c
    return img


def rounded_bg(size, margin_frac, radius_frac, top=NAVY, bottom=BLUE):
    """Ust uste supersampling ile yumusatilmis gradyan yuvarlatilmis zemin."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    grad = gradient_image(size, top, bottom)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [int(size * margin_frac)] * 2 + [int(size * (1 - margin_frac))] * 2,
        radius=int(size * radius_frac),
        fill=255,
    )
    img.paste(grad, (0, 0), mask)
    return img


def make_logo(size=1024, ss=4):
    """Telefon ustte, ok ortada, klasor altta."""
    S = size * ss
    img = rounded_bg(S, margin_frac=0.031, radius_frac=0.185)
    d = ImageDraw.Draw(img)
    cx = S / 2

    # Telefon govdesi (beyaz)
    d.rounded_rectangle(
        [cx - 0.117 * S, 0.195 * S, cx + 0.117 * S, 0.586 * S],
        radius=0.068 * S, fill=WHITE,
    )
    # Ekran (lacivert)
    d.rounded_rectangle(
        [cx - 0.097 * S, 0.22 * S, cx + 0.097 * S, 0.561 * S],
        radius=0.04 * S, fill=SCREEN,
    )
    # Kamera noktasi + hoparlor cizgisi
    d.ellipse([cx - 0.009 * S, 0.235 * S, cx + 0.009 * S, 0.253 * S], fill=WHITE)
    d.rounded_rectangle(
        [cx - 0.05 * S, 0.29 * S, cx + 0.05 * S, 0.3 * S],
        radius=0.005 * S, fill=WHITE,
    )

    # Asagi ok (telefondan klasore)
    d.rectangle([cx - 0.014 * S, 0.588 * S, cx + 0.014 * S, 0.672 * S], fill=WHITE)
    d.polygon(
        [
            (cx - 0.056 * S, 0.645 * S),
            (cx + 0.056 * S, 0.645 * S),
            (cx, 0.712 * S),
        ],
        fill=WHITE,
    )

    # Klasor (beyaz)
    d.rounded_rectangle(
        [0.332 * S, 0.684 * S, 0.547 * S, 0.719 * S],
        radius=0.012 * S, fill=WHITE,
    )
    d.rounded_rectangle(
        [0.312 * S, 0.714 * S, 0.688 * S, 0.793 * S],
        radius=0.02 * S, fill=WHITE,
    )

    return img.resize((size, size), Image.LANCZOS)


def make_tray(status_color, size=32, ss=8):
    """Koyu zemin + mini telefon/ok + durum noktasi (sag altta)."""
    S = size * ss
    img = rounded_bg(S, margin_frac=0.062, radius_frac=0.28)
    d = ImageDraw.Draw(img)
    cx = S / 2

    # Mini telefon
    d.rounded_rectangle(
        [cx - 0.2 * S, 0.16 * S, cx + 0.2 * S, 0.55 * S],
        radius=0.09 * S, fill=WHITE,
    )
    d.rounded_rectangle(
        [cx - 0.16 * S, 0.2 * S, cx + 0.16 * S, 0.51 * S],
        radius=0.05 * S, fill=SCREEN,
    )

    # Mini asagi ok
    d.rectangle([cx - 0.033 * S, 0.55 * S, cx + 0.033 * S, 0.63 * S], fill=WHITE)
    d.polygon(
        [
            (cx - 0.085 * S, 0.6 * S),
            (cx + 0.085 * S, 0.6 * S),
            (cx, 0.73 * S),
        ],
        fill=WHITE,
    )

    # Durum noktasi (beyaz halka + renkli dolgu)
    dcx, dcy = 0.73 * S, 0.73 * S
    d.ellipse([dcx - 0.135 * S, dcy - 0.135 * S, dcx + 0.135 * S, dcy + 0.135 * S],
              fill=WHITE)
    d.ellipse([dcx - 0.1 * S, dcy - 0.1 * S, dcx + 0.1 * S, dcy + 0.1 * S],
              fill=status_color)

    return img.resize((size, size), Image.LANCZOS)


def main():
    make_logo().save(f"{BASE}\\app-logo-1024.png")
    make_tray(GRAY).save(f"{BASE}\\tray-offline.png")
    make_tray(GREEN).save(f"{BASE}\\tray-online.png")
    print("OK: app-logo-1024.png, tray-offline.png, tray-online.png ->", BASE)


if __name__ == "__main__":
    main()
