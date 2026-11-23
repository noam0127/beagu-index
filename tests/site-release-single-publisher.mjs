import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {join} from "node:path";

const DIR = ".github/workflows";
const RELEASE = "beagu-release-controller.yml";

test("only the signed admin controller can publish GitHub Pages", () => {
  const workflows = readdirSync(DIR).filter(name => /\.ya?ml$/.test(name));
  const publishers = workflows.filter(name => {
    const text = readFileSync(join(DIR, name), "utf8");
    // Any direct Pages publisher outside the administrator release queue can
    // replace the entire site with an obsolete frozen snapshot.
    return /^[^#\n]*uses:\s*actions\/deploy-pages@/m.test(text);
  });
  assert.deepEqual(publishers, [RELEASE],
    "An alternate workflow can overwrite the approved production site");
});

test("retired one-time hotfixes cannot run or publish obsolete snapshots", () => {
  for (const file of [
    "challenge-login-only-hotfix-20261123.yml",
    "hotfix-priority-batch-production-20261123.yml"
  ]) {
    const text = readFileSync(join(DIR, file), "utf8");
    assert.match(text, /if:\s*\$\{\{\s*false\s*\}\}/,
      file + " is not disabled");
    assert.doesNotMatch(text, /\bpush\s*:/, file + " still auto-starts");
    assert.doesNotMatch(text, /actions\/deploy-pages@/,
      file + " still has publishing power");
    assert.doesNotMatch(text, /^\s*pages:\s*write\b/m,
      file + " still has Pages write permission");
  }
});

test("release worker pins production independently from the preview SHA", () => {
  const worker = readFileSync("scripts/release-manager/worker.py", "utf8");
  const api = readFileSync("supabase/functions/beagu-release-manager-v1/index.ts", "utf8");
  assert.match(worker, /archive\(production, OUTPUT\)/);
  assert.match(worker, /archive\(staging, preview_dir\)/);
  assert.match(api, /claimed\.target==="production"\?claimed\.to_sha:s\.production_sha/);
  assert.match(api, /claimed\.target==="staging"\?claimed\.to_sha:s\.staging_sha/);
});
