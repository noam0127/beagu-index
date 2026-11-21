#!/usr/bin/env python3
"""Local-only encrypted PostgreSQL backup helper for BAEGUINDEX v1.1.0.

Use on a trusted computer, never in CI or a public GitHub repository.
This creates a GPG-encrypted PostgreSQL custom-format logical dump and
checks that pg_restore can read its archive directory. This check is NOT
a restoration rehearsal; only an isolated database restore can certify that.
No connection credentials, table contents, or encryption secrets are logged.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

PROJECT_REF = "snvzwrexuqavnfvzgxqj"
REPO_ROOT = Path(__file__).resolve().parents[2]
FINGERPRINT = re.compile(r"^(?:[A-Fa-f0-9]{40}|[A-Fa-f0-9]{64})$")
REQUIRED_ENV = ("PGHOST", "PGUSER", "PGDATABASE")


def validate(output: Path, recipient: str, env: dict) -> None:
    if not FINGERPRINT.fullmatch(recipient):
        raise ValueError("A full 40- or 64-hex public GPG key fingerprint is required.")
    if output.suffix.lower() != ".gpg":
        raise ValueError("Backup filename must end with .gpg.")
    destination = output.resolve(strict=False)
    if destination.is_relative_to(REPO_ROOT):
        raise ValueError("Backup output must be outside the Git repository.")
    if not destination.parent.is_dir():
        raise ValueError("Backup output parent directory does not exist.")
    if destination.exists():
        raise ValueError("Refusing to overwrite an existing backup.")
    for field in REQUIRED_ENV:
        if not env.get(field):
            raise ValueError("Missing PostgreSQL connection environment setting: " + field)
    if PROJECT_REF not in env["PGHOST"] and PROJECT_REF not in env["PGUSER"]:
        raise ValueError("Connection does not explicitly identify the production project.")
    if env.get("PGSSLMODE", "").lower() not in ("verify-full", "verify-ca", "require"):
        raise ValueError("PGSSLMODE must enforce TLS, e.g. require or verify-full.")
    if not env.get("PGPASSWORD") and not env.get("PGPASSFILE"):
        raise ValueError("Use a private PGPASSFILE or PGPASSWORD; do not put secrets in arguments.")


def command_available(name: str) -> None:
    if shutil.which(name) is None:
        raise RuntimeError(name + " is not installed or on PATH.")


def version(command: str) -> str:
    p = subprocess.run([command, "--version"], capture_output=True, text=True, check=True)
    return p.stdout.strip()


def create(output: Path, recipient: str, env: dict) -> dict:
    validate(output, recipient, env)
    for command in ("pg_dump", "pg_restore", "gpg"):
        command_available(command)
    dump_version = version("pg_dump")
    if not re.search(r"(?:PostgreSQL\)\s*|PostgreSQL\s*)17(?:[.\s]|$)", dump_version):
        raise RuntimeError("A PostgreSQL 17 pg_dump client is required for this PostgreSQL 17 database.")
    # Never pass the DB URI/password on the command line.
    # No plaintext dump file is ever written to local disk.
    partial = output.with_name(output.name + ".part")
    if partial.exists():
        raise ValueError("Partial backup already exists: remove it after inspecting.")
    subprocess.run(["gpg", "--batch", "--list-keys", recipient],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    try:
        dump = subprocess.Popen(["pg_dump", "--format=custom", "--blobs"],
                                env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            encrypt = subprocess.Popen(
                ["gpg", "--batch", "--no-tty", "--trust-model", "always",
                 "--encrypt", "--recipient", recipient, "--output", str(partial)],
                stdin=dump.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            dump.stdout.close()
            _, encrypt_err = encrypt.communicate()
            _, dump_err = dump.communicate()
            if dump.returncode != 0 or encrypt.returncode != 0:
                raise RuntimeError(
                    "Backup process failed. Database and GPG diagnostics are hidden to "
                    "avoid leaking sensitive connection details (inspect locally).")
        except BaseException:
            if dump.poll() is None:
                dump.kill()
                dump.communicate()
            raise
        if not partial.is_file() or partial.stat().st_size < 512:
            raise RuntimeError("Encrypted dump is missing or unexpectedly small.")
        # Decrypt only in a pipe. Archive directory output is not saved.
        decrypt = subprocess.Popen(
            ["gpg", "--batch", "--no-tty", "--decrypt", str(partial)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            check = subprocess.Popen(
                ["pg_restore", "--list"], stdin=decrypt.stdout,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            decrypt.stdout.close()
            listing, restore_err = check.communicate()
            _, decrypt_err = decrypt.communicate()
        except BaseException:
            if decrypt.poll() is None:
                decrypt.kill()
                decrypt.communicate()
            raise
        if decrypt.returncode != 0 or check.returncode != 0:
            raise RuntimeError("GPG decrypt / pg_restore archive listing failed.")
        if b"TABLE DATA" not in listing or b"TABLE" not in listing:
            raise RuntimeError("Archive directory appears to be missing table records.")
        digest = hashlib.sha256()
        with partial.open("rb") as archive:
            for chunk in iter(lambda: archive.read(1024 * 1024), b""):
                digest.update(chunk)
        partial.replace(output)
        report = {
            "project_ref": PROJECT_REF,
            "generated_utc": datetime.now(timezone.utc).isoformat(),
            "encrypted_archive_sha256": digest.hexdigest(),
            "encrypted_archive_bytes": output.stat().st_size,
            "pg_dump_version": dump_version,
            "archive_directory_readable": True,
            "isolated_restore_verified": False,
            "supabase_storage_object_backup_verified": False,
            "limitations": "DB-only logical backup; storage blobs, managed secrets, and true isolated restore unverified."
        }
        meta = output.with_suffix(output.suffix + ".verification.json")
        meta.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return report
    finally:
        if partial.exists():
            partial.unlink()


def self_test() -> None:
    # Does not contact any database or inspect any user files.
    env = {
        "PGHOST": "db." + PROJECT_REF + ".supabase.co",
        "PGUSER": "postgres",
        "PGDATABASE": "postgres",
        "PGSSLMODE": "require",
        "PGPASSFILE": "/private/pgpass"
    }
    with tempfile.TemporaryDirectory() as base:
        good = Path(base) / "backup.gpg"
        validate(good, "A" * 40, env)
        for target, fingerprint, settings in [
            (REPO_ROOT / "unsafe.gpg", "A" * 40, env),
            (good, "bad", env),
            (good, "A" * 40, {**env, "PGHOST": "db.other.supabase.co"}),
            (good, "A" * 40, {**env, "PGSSLMODE": "disable"}),
            (good, "A" * 40, {**env, "PGPASSFILE": ""}),
            (good.with_suffix(".sql"), "A" * 40, env),
        ]:
            try:
                validate(target, fingerprint, settings)
            except ValueError:
                pass
            else:
                raise AssertionError("Fail-closed validation did not reject unsafe config.")
    print("PASS: local-only backup helper rejects unsafe paths, wrong projects, no TLS and absent credentials.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Encrypted .gpg archive OUTSIDE Git.")
    parser.add_argument("--recipient", help="Full GPG public key fingerprint (never a passphrase).")
    parser.add_argument("--self-test", action="store_true", help="Offline safety tests; never reads DB.")
    options = parser.parse_args()
    if options.self_test:
        self_test()
        return 0
    if not options.output or not options.recipient:
        parser.error("--output and --recipient are required unless --self-test is used.")
    try:
        report = create(options.output, options.recipient, os.environ.copy())
        print("Encrypted archive created and archive listing verified.")
        print("Encrypted SHA-256:", report["encrypted_archive_sha256"])
        print("IMPORTANT: restore to a fully isolated DB and verify data before marking stage 4 complete.")
    except (ValueError, RuntimeError, subprocess.CalledProcessError, OSError) as error:
        print("Backup NOT VERIFIED: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
