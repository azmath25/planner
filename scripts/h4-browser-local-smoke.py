#!/usr/bin/env python3
"""H4.3: test the real built Dayframe auth UI and local demo, with network isolated.

No credentials, signups, real login or Neon writes. Requires Python Playwright,
a previously installed Chromium, Node 24 and existing npm dependencies.
"""
from pathlib import Path
import os
import signal
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
PORT = 4187
BASE = f"http://127.0.0.1:{PORT}"
BRANCH = "feature/dayframe-m53-release-20261107"

def main():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise RuntimeError("Python Playwright is not installed; no packages were installed automatically.")
    active = subprocess.check_output(["git", "branch", "--show-current"], cwd=ROOT, text=True).strip()
    if active != BRANCH:
        raise RuntimeError(f"Refusing non-feature checkout: {active}")
    major = int(subprocess.check_output(["node", "-p", "process.versions.node.split('.')[0]"], cwd=ROOT, text=True))
    if major < 24:
        raise RuntimeError("Node 24+ is required.")
    if not (ROOT / "node_modules").is_dir():
        raise RuntimeError("Existing node_modules missing; do not reinstall packages automatically.")
    with socket.socket() as sock:
        try:
            sock.bind(("127.0.0.1", PORT))
        except OSError as exc:
            raise RuntimeError(f"Local port {PORT} already occupied; refusing to use another process.") from exc
    print("Building the real feature-branch Vite frontend (no deployment).", flush=True)
    with tempfile.TemporaryFile(mode="w+t") as log:
        result = subprocess.run(["npm", "run", "build"], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=False)
        if result.returncode:
            log.seek(0)
            raise RuntimeError("Local build failed:\n" + "".join(log.readlines()[-35:]))
    print("PASS: real frontend build.", flush=True)

    with tempfile.TemporaryFile(mode="w+t") as log:
        server = subprocess.Popen(
            ["npm", "run", "preview", "--", "--port", str(PORT), "--strictPort"],
            cwd=ROOT,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        try:
            ready = False
            for _ in range(60):
                if server.poll() is not None:
                    break
                try:
                    with urlopen(f"{BASE}/planner/", timeout=1) as response:
                        ready = response.status == 200
                    if ready:
                        break
                except Exception:
                    time.sleep(0.5)
            if not ready:
                log.seek(0)
                raise RuntimeError("Local Vite preview not available:\n" + "".join(log.readlines()[-25:]))
            print("PASS: isolated localhost preview, /planner/ subpath.", flush=True)
            with sync_playwright() as p:
                opts = {
                    "headless": True,
                    "args": ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
                }
                if Path("/usr/bin/chromium").is_file():
                    opts["executable_path"] = "/usr/bin/chromium"
                browser = p.chromium.launch(**opts)
                try:
                    context = browser.new_context(
                        viewport={"width": 390, "height": 844},
                        service_workers="block",
                    )
                    # Deliberately block ALL non-local requests; even Auth GET
                    # calls must not contact live Neon during this test.
                    context.route("**/*", lambda route: (
                        route.continue_() if route.request.url.startswith(BASE + "/")
                        else route.abort()
                    ))
                    page = context.new_page()
                    page.set_default_timeout(20000)
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.goto(f"{BASE}/planner/", wait_until="domcontentloaded")
                    page.get_by_role("heading", name="Welcome back").wait_for()
                    assert page.get_by_label("Email address").is_visible()
                    assert page.get_by_label("Password").is_visible()
                    print("PASS: signed-out login form loads without touching Neon.", flush=True)
                    page.get_by_role("button", name="New here? Create an account").click()
                    page.get_by_role("heading", name="Make room for what matters").wait_for()
                    assert page.get_by_label("Your name").is_visible()
                    page.get_by_role("button", name="Already registered? Sign in").click()
                    page.get_by_role("heading", name="Welcome back").wait_for()
                    print("PASS: login/signup UI navigation.", flush=True)
                    page.get_by_role("button", name="Open local demo without signing in").click()
                    page.locator('[data-react-host="local-preview"]').wait_for()
                    page.locator("#app").wait_for()
                    page.locator('.mobile-nav [data-page="tasks"]').wait_for()
                    print("PASS: local-only Dayframe demo mounts without authentication.", flush=True)
                    for width in (320, 390, 768, 1440):
                        page.set_viewport_size({"width": width, "height": 850})
                        page.wait_for_timeout(150)
                        dims = page.evaluate("({innerWidth, scroll:document.documentElement.scrollWidth})")
                        assert dims["scroll"] <= dims["innerWidth"] + 4, (
                            f"Horizontal overflow at {width}px: {dims}"
                        )
                    print("PASS: local demo has no horizontal overflow at 320/390/768/1440px.", flush=True)
                    if errors:
                        raise RuntimeError("Unhandled browser errors: " + "; ".join(errors[:5]))
                    context.close()
                finally:
                    browser.close()
        finally:
            # Own process group ONLY; never kill another developer's server.
            if server.poll() is None:
                os.killpg(server.pid, signal.SIGTERM)
                try:
                    server.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(server.pid, signal.SIGKILL)
                    server.wait(timeout=5)

    print("PASS: H4.3 isolated browser UI smoke (not real login).", flush=True)
    print("NOT TESTED: real session/JWT, protected API, Safari cookies, Neon migrations, deployment.", flush=True)

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"FAIL: H4.3 local UI smoke: {exc}", file=sys.stderr)
        sys.exit(1)
