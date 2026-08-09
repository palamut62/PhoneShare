"""Task Scheduler kaydini kaldirir.  Kullanim: python scripts/uninstall_service.py"""

from __future__ import annotations

import os
import subprocess
import sys

TASK_NAME = "PhoneShareReceiver"


def main() -> int:
    if os.name != "nt":
        print("Bu betik yalnizca Windows'ta calisir.", file=sys.stderr)
        return 1

    result = subprocess.run(
        ["schtasks", "/Delete", "/TN", TASK_NAME, "/F"],
        capture_output=True,
        text=True,
        check=False,
    )
    sys.stdout.write(result.stdout)
    sys.stderr.write(result.stderr)
    if result.returncode != 0:
        return result.returncode
    print(f"'{TASK_NAME}' gorevi kaldirildi.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
