#!/usr/bin/env python3
"""Hermetic local QA preflight: no database writes, no Pages deploys."""
import functools
import http.server
from html.parser import HTMLParser
import importlib.util
import json
import pathlib
import re
import subprocess
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/release-manager/build-isolated-candidate.py"
SPEC = importlib.util.spec_from_file_location("isolated_candidate_step13", SCRIPT)
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)
SHA = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
LIVE = "snvzwrexuqavnfvzgxqj"
TEST = "ycwuugggqbunlbwuzvbx"


class ClientReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "script" and a.get("src"):
            self.references.append(a["src"])
        if tag == "link" and "stylesheet" in a.get("rel", "") and a.get("href"):
            self.references.append(a["href"])


assert re.fullmatch(r"[0-9a-f]{40}", SHA)
assert not builder.approved_path("CNAME")
assert not builder.approved_path("release-candidate.json")
assert not builder.approved_path(".github/workflows/beagu-release-controller.yml")
assert not builder.approved_path("supabase/functions/beagu-release-manager-v1/index.ts")
assert not builder.approved_path("docs/private.md")
assert not builder.approved_path("scripts/release-manager/worker.py")
assert not builder.approved_path("../../../secrets.txt")
assert builder.approved_path("index.html")
assert builder.approved_path("js/supabase-config.js")
assert builder.approved_path("data/public-compare-school-directory-v1.json")
try:
    builder.selected_git_files("bad")
    raise AssertionError("Malformed SHA accepted")
except ValueError:
    pass
try:
    builder.selected_git_files("0"*40)
    raise AssertionError("Non-HEAD SHA accepted")
except RuntimeError:
    pass

with tempfile.TemporaryDirectory(prefix="beagu-step13-") as temp:
    base = pathlib.Path(temp)
    output = base / "candidate"
    result = builder.build(SHA, output)
    manifest = json.loads(
        (output / ".qa-candidate-manifest.json").read_text(encoding="utf8")
    )
    assert manifest == result
    assert manifest["candidate_sha"] == SHA
    assert manifest["status"] == "local_qa_artifact_only"
    assert manifest["publicly_hosted"] is False
    assert manifest["release_version_created"] is False
    assert manifest["site_deployed"] is False
    assert manifest["production_supabase_allowed"] is False
    assert manifest["final_release_gate"] == "blocked"
    assert manifest["sandbox_db_auth_rls"] == "unverified"
    assert manifest["candidate_browser_e2e"] == "not_performed"
    assert manifest["file_count"] > 190
    assert manifest["html_pages"] >= 10
    assert not (output / "CNAME").exists()
    assert not (output / "release-candidate.json").exists()
    assert not (output / "supabase").exists()
    assert not (output / "scripts").exists()
    assert not (output / ".github").exists()
    assert not (output / "docs").exists()
    assert not (output / "wrangler.jsonc").exists()
    assert not (output / "README.md").exists()
    assert (output / "robots.txt").read_text().endswith("Disallow: /\n")

    prod_refs = []
    for file in output.rglob("*"):
        if not file.is_file() or file.suffix.lower() not in (".html", ".js", ".mjs"):
            continue
        raw = file.read_text(encoding="utf8")
        if LIVE in raw:
            prod_refs.append(file.relative_to(output).as_posix())
        if file.suffix.lower() == ".html":
            assert "beagu-isolated-qa" in raw, str(file)
            assert "noindex,nofollow,noarchive" in raw, str(file)
            assert "Content-Security-Policy" in raw, str(file)
            assert "connect-src 'self' https://" + TEST + ".supabase.co" in raw, str(file)
            assert "form-action 'none'" in raw, str(file)
    assert not prod_refs, "Production Supabase origin leaked: " + repr(prod_refs[:8])
    config = (output / "js/supabase-config.js").read_text(encoding="utf8")
    assert TEST in config and LIVE not in config
    assert builder.LIVE_KEY not in config

    # Serve on loopback only; all tested requests stay entirely local.
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(output))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f"http://127.0.0.1:{server.server_address[1]}"
    count = 0
    try:
        for page in ("index.html", "challenge.html", "admin-updates.html",
                     "search-lv1.html", "statistics.html"):
            with urllib.request.urlopen(origin + "/" + page, timeout=5) as response:
                assert response.status == 200
                body = response.read().decode("utf8")
            assert "beagu-isolated-qa" in body
            parsed = ClientReferences()
            parsed.feed(body)
            assert len(parsed.references) >= 2, (page, parsed.references)
            for path in parsed.references:
                uri = urllib.parse.urlparse(path)
                if uri.scheme or path.startswith("//"):
                    continue  # CDNs are not fetched by this test.
                asset_path = uri.path.lstrip("/")
                if not asset_path:
                    continue
                assert (output / asset_path).is_file(), (
                    page, "missing candidate asset", path
                )
                if count < 30:
                    with urllib.request.urlopen(
                        origin + "/" + urllib.parse.quote(asset_path), timeout=5
                    ) as response:
                        assert response.status == 200, (page, path)
                count += 1
        try:
            urllib.request.urlopen(origin + "/supabase/functions/beagu-release-manager-v1/index.ts", timeout=5)
            raise AssertionError("Non-website source leaked to the local server")
        except urllib.error.HTTPError as exc:
            assert exc.code == 404
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    try:
        builder.build(SHA, output)
        raise AssertionError("Existing QA output overwritten")
    except FileExistsError:
        pass

    assert (output / "index.html").is_file()
print(
    "PASS: local-only immutable preview, no repo internals, no production DB "
    f"connections, {manifest['file_count']} web files and {count} asset links"
)
