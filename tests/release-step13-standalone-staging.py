#!/usr/bin/env python3
"""Step 13: offline tests of independently hosted staging artifact only."""
import importlib.util
import pathlib
import re
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "isolated_stage_builder", ROOT / "scripts/release-manager/build-isolated-staging.py"
)
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)
SHA = subprocess.check_output(["git", "rev-parse", "HEAD"],
                              cwd=ROOT, text=True).strip()
ORIGIN = "https://staging-build.example.invalid"

class StandaloneStagingTests(unittest.TestCase):
    def test_production_and_insecure_origins_are_refused(self):
        for origin in (
            "", "http://staging.example.invalid",
            "https://baeguindex.com", "https://www.baeguindex.com",
            "https://ycwuugggqbunlbwuzvbx.supabase.co",
            "https://staging.example.invalid/subpath",
            "https://staging.example.invalid?token=abc",
            "file:///tmp/stage", "https://localhost",
        ):
            with self.subTest(origin=origin):
                with self.assertRaises(ValueError):
                    builder.validate_origin(origin)

    def test_allowed_independent_https_origin(self):
        self.assertEqual(
            builder.validate_origin(ORIGIN),
            ORIGIN
        )
        self.assertEqual(
            builder.validate_origin("https://staging.example.invalid/"),
            "https://staging.example.invalid"
        )

    def test_source_paths_filter_out_internal_and_release_files(self):
        for path in (
            ".github/workflows/build.yml", "supabase/functions/api/index.ts",
            "scripts/release-manager/worker.py", "tests/security.py",
            "docs/releases/private.md", "CNAME", ".env",
            "release-candidate.json", "_preview/index.html",
            "node_modules/package/index.js", "../secret.css",
            "js/../../prod.js", "js/secret.sql", "js/source.map",
            "config/secrets.yaml", "js/symlink",
        ):
            with self.subTest(path=path):
                self.assertFalse(builder.allow_asset(path))
        for path in ("index.html", "js/supabase-config.js", "styles/site.css",
                     "data/public-compare-school-directory-v1.json", "images/photo.webp"):
            self.assertTrue(builder.allow_asset(path))

    def test_bad_commit_sha_never_creates_hosted_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            destination = pathlib.Path(tmp) / "staging"
            with self.assertRaises(ValueError):
                builder.build("not-a-real-commit", destination, ORIGIN)
            self.assertFalse(destination.exists())

    def test_existing_output_is_never_deleted(self):
        with tempfile.TemporaryDirectory() as tmp:
            destination = pathlib.Path(tmp) / "staging"
            destination.mkdir()
            (destination / "important.txt").write_text("stay", encoding="utf8")
            with self.assertRaises(FileExistsError):
                builder.build(SHA, destination, ORIGIN)
            self.assertEqual((destination / "important.txt").read_text(), "stay")

    def test_full_standalone_artifact_in_temp_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            destination = pathlib.Path(tmp) / "site"
            result = builder.build(SHA, destination, ORIGIN)
            self.assertEqual(result["status"], "artifact_only_not_deployed")
            self.assertEqual(result["candidate_commit_sha"], SHA)
            self.assertFalse(result["deployment_authorized"])
            self.assertFalse(result["staging_db_ready"])
            self.assertFalse(result["runtime_auth_e2e_verified"])
            self.assertGreater(result["source_files"], 100)
            self.assertGreater(result["rewritten_files"], 10)

            self.assertTrue((destination / "index.html").is_file())
            self.assertFalse((destination / "CNAME").exists())
            self.assertFalse((destination / "_preview").exists())
            self.assertFalse((destination / ".github").exists())
            self.assertFalse((destination / "supabase").exists())
            self.assertFalse((destination / "scripts").exists())
            self.assertFalse((destination / "tests").exists())
            self.assertFalse((destination / "docs").exists())
            self.assertEqual((destination / "robots.txt").read_text(),
                             "User-agent: *\nDisallow: /\n")
            self.assertTrue((destination / ".nojekyll").exists())

            config = (destination / "js/supabase-config.js").read_text()
            self.assertIn(builder.STAGE_REF, config)
            self.assertIn(builder.STAGE_KEY, config)
            self.assertNotIn(builder.LIVE_REF, config)
            self.assertNotIn(builder.LIVE_KEY, config)

            html = (destination / "index.html").read_text()
            self.assertIn('id="beagu-isolated-staging"', html)
            self.assertIn("noindex,nofollow,noarchive", html)
            self.assertIn("connect-src 'self' https://" + builder.STAGE_REF + ".supabase.co", html)
            self.assertIn("form-action 'self'", html)
            self.assertIn("frame-src 'self'", html)

            scanned = 0
            for file in destination.rglob("*"):
                if file.is_file() and file.suffix.lower() in builder.TEXT_EXT:
                    body = file.read_text(encoding="utf8")
                    self.assertNotIn(builder.LIVE_REF, body, file.as_posix())
                    self.assertNotIn(builder.LIVE_KEY, body, file.as_posix())
                    self.assertNotIn("baeguindex.com", body, file.as_posix())
                    self.assertNotIn("/_preview/", body, file.as_posix())
                    scanned += 1
            self.assertGreater(scanned, 100)
            self.assertEqual(
                (destination / "staging-build-status.json").read_text().count(
                    '"deployment_authorized": false'), 1
            )

            # Git and production files stay unchanged by the offline build.
            before = subprocess.check_output(["git", "show", SHA + ":index.html"],
                                             cwd=ROOT)
            after = (ROOT / "index.html").read_bytes()
            self.assertEqual(before, after)

if __name__ == "__main__":
    unittest.main(verbosity=2)
