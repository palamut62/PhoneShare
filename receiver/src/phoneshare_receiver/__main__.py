"""PhoneShare Receiver CLI.

  phoneshare-receiver run              Receiver'i baslatir (varsayilan)
  phoneshare-receiver config --show    Ayarlari gosterir
  phoneshare-receiver config --set k=v Ayar degistirir
  phoneshare-receiver --about          Urun sahibi / surum bilgisi
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
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
    if args.published_host:
        cfg.published_host = args.published_host
    cfg = sanitize_config(cfg)

    setup_logging(cfg.log_level)
    log = get_logger("system")
    log.info(
        "receiver baslatiliyor",
        extra={"category": "system", "host": cfg.host, "port": cfg.port},
    )

    if args.management_port and args.management_port == cfg.port:
        print("Yonetim portu yayin portundan farkli olmali.", file=sys.stderr)
        return 2
    state = ReceiverState(cfg)
    state.management_port = args.management_port
    state.local_capability = os.environ.get("PHONESHARE_LOCAL_TOKEN") or os.environ.get("PHONESHARE_LOCAL_CAPABILITY")
    app = create_app(state, configure_logging=False, web_dist=args.web_dist)
    if args.management_port:
        return asyncio.run(_run_dual(app, state, cfg, args.management_port))
    uvicorn.run(
        app,
        host=cfg.host,
        port=cfg.port,
        ssl_certfile=cfg.tls_certfile,
        ssl_keyfile=cfg.tls_keyfile,
        log_config=None,
    )
    return 0


async def _run_dual(app, state, cfg: ReceiverConfig, management_port: int) -> int:
    """Run public and loopback management listeners against one initialized state."""
    import uvicorn

    log = get_logger("system")
    await state.startup()
    public = uvicorn.Server(uvicorn.Config(app, host=cfg.host, port=cfg.port, ssl_certfile=cfg.tls_certfile, ssl_keyfile=cfg.tls_keyfile, lifespan="off", log_config=None, proxy_headers=False))
    management = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=management_port, lifespan="off", log_config=None, proxy_headers=False))
    tasks = [asyncio.create_task(public.serve()), asyncio.create_task(management.serve())]
    exit_code = 0
    try:
        # Bir dinleyici baslayamazsa (port dolu, TLS hatasi) yarim calisan bir
        # receiver birakilmaz: her iki dinleyici de durdurulur ve hata dondurulur.
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        if pending:
            exit_code = 1
            public.should_exit = True
            management.should_exit = True
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
        for task in done:
            error = task.exception() if not task.cancelled() else None
            if error is not None:
                exit_code = 1
                log.error(
                    "Dinleyici baslatilamadi.",
                    extra={"category": "system", "error": str(error)},
                )
    finally:
        await state.shutdown()
    return exit_code


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
    run.add_argument("--management-port", type=int, help="Loopback HTTP yonetim portu")
    run.add_argument("--published-host", help="Telefonlara yayinlanan DNS/IP adresi")
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
            argparse.Namespace(host=None, port=None, web_dist=None, tls_certfile=None, tls_keyfile=None, management_port=None, published_host=None)
        )
    return int(args.func(args))


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
