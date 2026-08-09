"""PhoneShare Receiver CLI.

  phoneshare-receiver run              Receiver'i baslatir (varsayilan)
  phoneshare-receiver config --show    Ayarlari gosterir
  phoneshare-receiver config --set k=v Ayar degistirir
  phoneshare-receiver --about          Urun sahibi / surum bilgisi
"""

from __future__ import annotations

import argparse
import json
import sys

from . import __version__
from .core.config import ReceiverConfig, config_file, load_config, sanitize_config, save_config
from .core.logging_setup import get_logger, setup_logging

OWNER = "Umut Celik (palamut62)"
OWNER_X = "https://x.com/palamut62"
OWNER_GITHUB = "https://github.com/palamut62"


def _about() -> str:
    return (
        f"PhoneShare Receiver {__version__}\n"
        f"Urun sahibi: {OWNER}\n"
        f"X: {OWNER_X}\n"
        f"GitHub: {OWNER_GITHUB}"
    )


def _coerce(current: object, raw: str) -> object:
    if isinstance(current, bool):
        return raw.strip().lower() in ("1", "true", "yes", "on", "evet")
    if isinstance(current, int):
        return int(raw)
    if isinstance(current, float):
        return float(raw)
    if isinstance(current, list):
        return [p.strip() for p in raw.split(",") if p.strip()]
    return raw


def _cmd_config(args: argparse.Namespace) -> int:
    cfg = load_config()
    if args.set:
        for item in args.set:
            if "=" not in item:
                print(f"Gecersiz atama: {item}", file=sys.stderr)
                return 2
            key, raw = item.split("=", 1)
            key = key.strip()
            if key not in ReceiverConfig.__dataclass_fields__:
                print(f"Bilinmeyen ayar: {key}", file=sys.stderr)
                return 2
            setattr(cfg, key, _coerce(getattr(cfg, key), raw))
        cfg = sanitize_config(cfg)
        save_config(cfg)
        print(f"Kaydedildi: {config_file()}")
    if args.show or not args.set:
        print(json.dumps(cfg.to_dict(), indent=2, ensure_ascii=False))
    return 0


def _cmd_run(args: argparse.Namespace) -> int:
    import uvicorn

    from .app import create_app
    from .core.state import ReceiverState

    cfg = load_config()
    if args.host:
        cfg.host = args.host
    if args.port:
        cfg.port = args.port
    if args.tls_certfile:
        cfg.tls_certfile = args.tls_certfile
    if args.tls_keyfile:
        cfg.tls_keyfile = args.tls_keyfile
    cfg = sanitize_config(cfg)

    setup_logging(cfg.log_level)
    log = get_logger("system")
    log.info(
        "receiver baslatiliyor",
        extra={"category": "system", "host": cfg.host, "port": cfg.port},
    )

    state = ReceiverState(cfg)
    app = create_app(state, configure_logging=False, web_dist=args.web_dist)
    uvicorn.run(
        app,
        host=cfg.host,
        port=cfg.port,
        ssl_certfile=cfg.tls_certfile,
        ssl_keyfile=cfg.tls_keyfile,
        log_config=None,
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="phoneshare-receiver", description=__doc__)
    parser.add_argument("--version", action="version", version=__version__)
    parser.add_argument("--about", action="store_true", help="Urun sahibi ve surum bilgisi")
    sub = parser.add_subparsers(dest="command")

    run = sub.add_parser("run", help="Receiver'i baslatir")
    run.add_argument("--host")
    run.add_argument("--port", type=int)
    run.add_argument("--web-dist", help="PWA static export dizini")
    run.add_argument("--tls-certfile", help="TLS sertifika dosyasi (uvicorn ssl_certfile)")
    run.add_argument("--tls-keyfile", help="TLS ozel anahtar dosyasi (uvicorn ssl_keyfile)")
    run.set_defaults(func=_cmd_run)

    conf = sub.add_parser("config", help="Ayarlari goster/degistir")
    conf.add_argument("--show", action="store_true")
    conf.add_argument("--set", action="append", metavar="KEY=VALUE")
    conf.set_defaults(func=_cmd_config)

    args = parser.parse_args(argv)
    if args.about:
        print(_about())
        return 0
    if not getattr(args, "func", None):
        # Alt komut verilmediyse varsayilan davranis: receiver'i baslat.
        return _cmd_run(
            argparse.Namespace(host=None, port=None, web_dist=None, tls_certfile=None, tls_keyfile=None)
        )
    return int(args.func(args))


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
