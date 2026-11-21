import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const get = file => readFileSync(join(root, file), "utf8");

test("home and admin markup include notice editing, preview and save", () => {
  const home = get("index.html");
  const admin = get("admin.html");
  assert.match(home, /id="beaguHomeNoticeBody"/);
  assert.match(home, /beagu-home-notice-public-v1\.js/);
  for (const id of ["adminHomeNoticeForm","adminHomeNoticeText","adminHomeNoticePreview",
    "adminHomeNoticeSave","adminHomeNoticeReset","adminHomeNoticeStatus"])
    assert.ok(admin.includes('id="' + id + '"'), id);
  assert.match(admin, /beagu-home-notice-admin-v1\.js/);
});

test("published notice is always rendered as literal text", () => {
  for (const file of ["js/beagu-home-notice-public-v1.js","js/beagu-home-notice-admin-v1.js"]) {
    assert.match(get(file), /\.textContent\s*=/);
    assert.doesNotMatch(get(file), /innerHTML\s*=/);
  }
});

test("server saves only after admin MFA, authorization and active-session checks", () => {
  const edge = get("supabase/functions/beagu-home-notice-v1/index.ts");
  for (const signature of ["auth.getUser","beagu_admin_accounts","claims.aal","aal2",
    "beagu_admin_active_mfa_session","session_id","home_notice_updated",
    "edit_conflict","revision","body_length_invalid"]) assert.ok(edge.includes(signature), signature);
  assert.match(edge, /input\.action\s*!==\s*"save"/);
  assert.match(edge, /\.eq\("revision", revision\)/);
});

test("table denies direct unauthenticated and ordinary signed-in access", () => {
  const sql = get("supabase/migrations/20261121_home_notice_admin_editor.sql");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.beagu_home_notice_v1 from public, anon, authenticated/i);
  assert.match(sql, /grant select, update on table public\.beagu_home_notice_v1 to service_role/i);
});

test("live GET serves the current notice and unauthenticated POST is denied", async () => {
  const cfg = get("js/supabase-config.js");
  const url = cfg.match(/const SUPABASE_URL = "([^"]+)"/)?.[1];
  const key = cfg.match(/const SUPABASE_PUBLISHABLE_KEY = "([^"]+)"/)?.[1];
  assert.ok(url && key);
  const endpoint = url + "/functions/v1/beagu-home-notice-v1";
  const base = { apikey: key };
  const read = await fetch(endpoint, { headers: base, signal: AbortSignal.timeout(12000) });
  assert.equal(read.status, 200, "public read status");
  const notice = await read.json();
  assert.equal(typeof notice.body, "string");
  assert.ok(notice.body.trim().length > 0);
  assert.ok(Number.isSafeInteger(notice.revision));
  const denied = await fetch(endpoint, {
    method: "POST",
    headers: { ...base, "Content-Type": "application/json", Origin: "https://baeguindex.com" },
    body: JSON.stringify({ action: "save", body: "unauthorized attempt", revision: notice.revision }),
    signal: AbortSignal.timeout(12000),
  });
  assert.equal(denied.status, 401, "anonymous save must be denied");
  const reread = await fetch(endpoint, { headers: base, signal: AbortSignal.timeout(12000) });
  assert.equal(reread.status, 200);
  const after = await reread.json();
  assert.equal(after.body, notice.body, "unauthorized POST must not change the notice");
  assert.equal(after.revision, notice.revision);
});
