#!/usr/bin/env python3
"""H4.4: audit and locally package the exact Dayframe feature API for STAGING ONLY.

No Neon calls, no deployment, no GitHub Actions, no secret reads or writes.
Use --plan first. --build runs targeted local tests and creates a ZIP in /tmp.
"""
import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
FEATURE = "feature/dayframe-m53-release-20261107"
STAGING_AUTH = "https://ep-wispy-surf-b94f834t.neonauth.c-7.eu-central-1.aws.neon.tech/dayframe/auth"
EXPECTED_SOURCE = ROOT / "backend/src/index.mjs"


def run(*args, capture=False):
    result = subprocess.run(args, cwd=ROOT, check=True, text=True,
                            capture_output=capture)
    return result.stdout.strip() if capture else None


def check_preconditions():
    current_branch = run("git", "branch", "--show-current", capture=True)
    if current_branch != FEATURE:
        raise RuntimeError("STOP: refusing non-feature branch " + current_branch)
    version = run("node", "-p", "process.versions.node", capture=True)
    if int(version.split(".")[0]) < 24:
        raise RuntimeError("STOP: Node 24+ required")
    if not EXPECTED_SOURCE.is_file():
        raise RuntimeError("STOP: backend source missing")
    api = EXPECTED_SOURCE.read_text(encoding="utf-8")
    required = (
        "DAYFRAME_ENV",
        "DAYFRAME_STAGING_ORIGIN",
        STAGING_AUTH,
        "NEON_AUTH_BASE_URL",
        "jwtVerify(token",
        "owner_user_id=$1",
    )
    for marker in required:
        if marker not in api:
            raise RuntimeError("STOP: feature staging/auth guard missing: " + marker)
    if not (ROOT / "node_modules/.bin/esbuild").is_file():
        raise RuntimeError("STOP: esbuild not installed; use existing checked dependency setup")
    print("PLAN PASS: feature branch, Node " + version + ", source and staging identity guard.")
    print("PLAN: run local source and API tests, bundle current backend/src/index.mjs as Node 24 ESM,")
    print("      verify JS/ZIP, store an untracked archive in /tmp. No deploy or production access.")


def build():
    print("CHECK: local source tests")
    run("npm", "run", "test:source")
    print("CHECK: local backend tests")
    run("npm", "run", "test:api")
    sha = run("git", "rev-parse", "--short=12", "HEAD", capture=True)
    # Only temp storage is used; no artifact is pushed into a repository.
    with tempfile.TemporaryDirectory(prefix="dayframe-h44-api-") as temp:
        built = Path(temp) / "index.mjs"
        run(str(ROOT / "node_modules/.bin/esbuild"),
            "backend/src/index.mjs", "--bundle", "--platform=node", "--target=node24",
            "--format=esm", "--external:pg-native",
            "--outfile=" + str(built),
            "--banner:js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);")
        run("node", "--check", str(built))
        target = Path(tempfile.gettempdir()) / ("dayframe-h44-staging-api-" + sha + ".zip")
        with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED,
                             compresslevel=9) as archive:
            archive.write(built, arcname="index.mjs")
        with zipfile.ZipFile(target, "r") as archive:
            if archive.namelist() != ["index.mjs"] or archive.testzip() is not None:
                raise RuntimeError("STOP: invalid staging API ZIP")
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        print("PASS: isolated staging API bundle prepared. NOT DEPLOYED.")
        print("Local ZIP: " + str(target))
        print("SHA-256: " + digest)
        print("Requires separate staging deploy and exact Vercel origin configuration before use.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--plan", action="store_true", help="preflight only, no build")
    group.add_argument("--build", action="store_true", help="local test and bundle only")
    args = parser.parse_args()
    try:
        check_preconditions()
        if args.build:
            build()
    except (RuntimeError, subprocess.CalledProcessError, OSError) as error:
        print("FAIL H4.4: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
