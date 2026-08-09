"""Windows acilisinda otomatik baslatma — Task Scheduler kaydi.

Neden gercek Windows Service degil?
- Agent'in tray ikonu ve kullanici oturumundaki klasor izinleriyle (D:\\... yazma,
  DPAPI ile kullaniciya bagli token cozme) calismasi gerekir. Gercek bir servis
  LocalSystem altinda calisir; DPAPI kapsami ve masaustu etkilesimi kaybolur.
- Task Scheduler "kullanici oturum acinca calistir" gorevi tam bu ihtiyaci karsilar
  ve yonetici hakki gerektirmez (ONLOGON gorevleri kullanici baglaminda olusur).

Kullanim:  python scripts/install_service.py
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

TASK_NAME = "PhoneShareReceiver"


def _python_exe() -> str:
    # Konsol penceresi acilmasin diye pythonw.exe tercih edilir.
    exe = Path(sys.executable)
    pythonw = exe.with_name("pythonw.exe")
    return str(pythonw if pythonw.exists() else exe)


def main() -> int:
    if os.name != "nt":
        print("Bu betik yalnizca Windows'ta calisir.", file=sys.stderr)
        return 1

    command = f'"{_python_exe()}" -m phoneshare_receiver run'
    args = [
        "schtasks",
        "/Create",
        "/TN",
        TASK_NAME,
        "/TR",
        command,
        "/SC",
        "ONLOGON",
        "/RL",
        "LIMITED",
        "/F",
    ]
    result = subprocess.run(args, capture_output=True, text=True, check=False)
    sys.stdout.write(result.stdout)
    sys.stderr.write(result.stderr)
    if result.returncode != 0:
        print(
            "Gorev olusturulamadi. Kurumsal politika nedeniyle yonetici olarak "
            "calistirmaniz gerekebilir.",
            file=sys.stderr,
        )
        return result.returncode

    print(f"'{TASK_NAME}' gorevi olusturuldu; oturum acildiginda agent baslar.")
    print("Hemen baslatmak icin: schtasks /Run /TN PhoneShareReceiver")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
