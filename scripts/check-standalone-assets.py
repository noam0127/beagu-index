#!/usr/bin/env python3
"""Audit a Vercel-free staging artifact for unresolved local file references.

Strictly checks literal HTML entrypoints, linked CSS, scripts, images, source
sets, and relative CSS url()/imports. Dynamic runtime URLs and deliberately
external CDNs are outside this static proof and require separate browser tests.
"""
from __future__ import annotations
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import posixpath
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "_standalone_staging"

FILE_EXT = {
    ".html", ".htm", ".css", ".js", ".mjs", ".json", ".svg", ".png",
    ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2",
    ".ttf", ".otf", ".mp3", ".m4a", ".ogg", ".wav", ".mp4", ".webm",
    ".pdf", ".txt", ".csv"
}
CSS_URL = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", flags=re.I | re.S)
CSS_IMPORT = re.compile(r"@import\s+(['\"])(.*?)\1", flags=re.I | re.S)
BAD_SCHEMES = {"javascript", "data", "blob", "mailto", "tel", "about"}

class Collector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.urls = []
        self.base_url = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        tag = tag.lower()
        if tag == "base" and attrs.get("href"):
            self.base_url = attrs["href"]
        if tag == "script":
            self.add(attrs.get("src"), "script")
        elif tag == "link":
            rel = (attrs.get("rel") or "").lower().split()
            if any(item in rel for item in ["stylesheet", "icon", "preload",
                                             "modulepreload", "apple-touch-icon"]):
                self.add(attrs.get("href"), "link")
        elif tag in {"img", "source", "video", "audio", "track", "embed",
                     "iframe", "input"}:
            if tag != "input" or attrs.get("type", "").lower() == "image":
                self.add(attrs.get("src"), tag)
            if tag == "video":
                self.add(attrs.get("poster"), "video poster")
            if tag in {"img", "source"} and attrs.get("srcset"):
                # srcset URLs containing commas in data URIs are ignored by
                # resolve(); literal file candidates are checked.
                for item in attrs["srcset"].split(","):
                    piece = item.strip().split()
                    if piece:
                        self.add(piece[0], "srcset")
        elif tag in {"a", "area"}:
            url = attrs.get("href")
            if url:
                self.add(url, "navigation", nav_only=True)

    def add(self, url, kind, nav_only=False):
        if url:
            self.urls.append((url.strip(), kind, nav_only))


def resolve(source: Path, url: str, base_url: str | None = None,
            nav_only: bool = False) -> str | None:
    """Return a relative artifact path, or None for an external/dynamic URL."""
    if not url or any(char in url for char in "<>{}"):
        return None
    if url.startswith(("#", "//")):
        return None
    parsed = urlsplit(url)
    if parsed.scheme.lower() in BAD_SCHEMES or parsed.netloc:
        return None
    if parsed.scheme:
        return None
    raw_path = unquote(parsed.path).replace("\\", "/")
    if not raw_path:
        return None
    suffix = Path(raw_path).suffix.lower()
    if nav_only and suffix not in {".html", ".htm"} and not raw_path.endswith("/"):
        return None
    if not nav_only and suffix and suffix not in FILE_EXT:
        # Don't demand intentionally non-web uploads such as .docx and .zip.
        return None
    root_based = raw_path.startswith("/")
    if base_url and not root_based:
        bp = urlsplit(base_url)
        if bp.scheme or bp.netloc:
            return None
        base_path = bp.path
        if base_path:
            if base_path.startswith("/"):
                base_path = base_path[1:]
            folder = base_path if base_path.endswith("/") else posixpath.dirname(base_path)
            raw_path = folder + raw_path if folder.endswith("/") else posixpath.join(folder, raw_path)
            root_based = True
    if root_based:
        target = raw_path.lstrip("/")
    else:
        target = posixpath.join(source.parent.relative_to(SITE).as_posix(), raw_path)
    target = posixpath.normpath(target)
    if target in {".", ""} or target.endswith("/"):
        target = posixpath.join(target, "index.html")
    if raw_path.endswith("/"):
        target = posixpath.join(target, "index.html") if not target.endswith("index.html") else target
    if target == ".." or target.startswith("../") or target.startswith("/"):
        raise ValueError("Reference escapes artifact root: " + url)
    return target


def audit():
    if not SITE.is_dir() or not (SITE / "index.html").is_file():
        raise RuntimeError("Run scripts/build-standalone-staging.py first")
    missing = []
    references = 0
    html_pages = sorted(SITE.rglob("*.html"))
    css_files = sorted(SITE.rglob("*.css"))
    for file in html_pages:
        parser = Collector()
        parser.feed(file.read_text(encoding="utf-8"))
        for url, kind, nav_only in parser.urls:
            local = resolve(file, url, parser.base_url, nav_only)
            if local is None:
                continue
            references += 1
            if not (SITE / local).is_file():
                missing.append((file.relative_to(SITE).as_posix(), kind, url, local))
    for file in css_files:
        body = file.read_text(encoding="utf-8")
        refs = [(m.group(2), "css url") for m in CSS_URL.finditer(body)]
        refs += [(m.group(2), "css import") for m in CSS_IMPORT.finditer(body)]
        for url, kind in refs:
            local = resolve(file, url)
            if local is None:
                continue
            references += 1
            if not (SITE / local).is_file():
                missing.append((file.relative_to(SITE).as_posix(), kind, url, local))
    for file, kind, url, target in missing[:80]:
        print("MISSING:", file, kind, repr(url), "->", target, file=sys.stderr)
    if missing:
        raise AssertionError(
            f"{len(missing)} unresolved local references; "
            f"{references} static references across {len(html_pages)} HTML and "
            f"{len(css_files)} CSS files"
        )
    print(f"PASS: {references} local paths resolved across "
          f"{len(html_pages)} HTML and {len(css_files)} CSS files")
    return references


if __name__ == "__main__":
    audit()
