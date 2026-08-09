"""Self-signed TLS sertifikasi uretir (LAN / Tailscale kullanimi icin).

Kullanim:
    python scripts/gen_cert.py --host 192.168.1.20 --host phoneshare.local
Uretilen dosyalar %LOCALAPPDATA%\\PhoneShare\\certs altina yazilir ve config'e islenir.
"""

from __future__ import annotations

import argparse
import datetime as dt
import ipaddress
import socket
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "receiver" / "src"))

import contextlib

from phoneshare_receiver.core.config import (
    app_data_dir,
    load_config,
    save_config,
)


def build(hosts: list[str], days: int, out_dir: Path) -> tuple[Path, Path]:
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name(
        [
            x509.NameAttribute(NameOID.COMMON_NAME, hosts[0]),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "PhoneShare"),
        ]
    )

    sans: list[x509.GeneralName] = []
    for host in hosts:
        try:
            sans.append(x509.IPAddress(ipaddress.ip_address(host)))
        except ValueError:
            sans.append(x509.DNSName(host))

    now = dt.datetime.now(dt.UTC)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(minutes=5))
        .not_valid_after(now + dt.timedelta(days=days))
        .add_extension(x509.SubjectAlternativeName(sans), critical=False)
        .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
        .sign(key, hashes.SHA256())
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    cert_path = out_dir / "agent.crt"
    key_path = out_dir / "agent.key"
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    with contextlib.suppress(OSError):
        key_path.chmod(0o600)
    return cert_path, key_path


def main() -> int:
    parser = argparse.ArgumentParser(description="PhoneShare agent icin self-signed sertifika")
    parser.add_argument("--host", action="append", default=[], help="DNS adi veya IP (tekrarlanabilir)")
    parser.add_argument("--days", type=int, default=825)
    parser.add_argument("--no-config", action="store_true", help="config.json'a yazma")
    args = parser.parse_args()

    hosts = args.host or [socket.gethostname(), "127.0.0.1", "localhost"]
    out_dir = app_data_dir() / "certs"
    try:
        cert_path, key_path = build(hosts, args.days, out_dir)
    except ImportError:
        print("`cryptography` paketi gerekli: uv pip install cryptography", file=sys.stderr)
        return 1

    print(f"Sertifika: {cert_path}")
    print(f"Anahtar  : {key_path}")

    if not args.no_config:
        cfg = load_config()
        cfg.tls_certfile = str(cert_path)
        cfg.tls_keyfile = str(key_path)
        save_config(cfg)
        print("config.json guncellendi (tls_certfile / tls_keyfile).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
