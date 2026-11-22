// v1.1.0 stage 35: fail-closed source boundary contracts (static only).
// These assertions cannot replace staging RLS, API abuse, or cross-account E2E.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = path => readFileSync(path, "utf8");
const level = read("supabase/functions/beagu-level-api/index.ts");
const postit = read("supabase/functions/beagu-postit-api-v1/index.ts");
const admin = read("supabase/functions/beagu-admin-members-v1/index.ts");
const worker = read("scripts/release-manager/worker.py");
const ui = read("js/beagu-participation-auth-v2.js");

const ordered = (source, first, second, name) => {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  assert.ok(a !== -1 && b !== -1 && a < b, name);
};

assert.match(level, /const session=await check\(req\);/, "Level API must check server session");
ordered(level, "const session=await check(req);", "if(body.action==='percentiles')", "Percentiles require checked session");
ordered(level, "if(!session)return send({error:'AUTH_REQUIRED'},401,origin)", "if(body.action==='verify')", "Verify must reject missing sessions");
assert.match(level, /token_sha256.*digest/, "Level session lookup must use token hash");
assert.match(level, /Date\.parse\(data\.expires_at\)<=Date\.now\(\)/, "Expired credentials must fail");
assert.match(level, /beagu_has_earned_challenge_visitor/, "Earned Lv2 must be revalidated");
assert.match(level, /\.eq\('approval_status','APPROVED'\)/, "Only approved material enters level result query");

const levelGuards = [...postit.matchAll(/const viewer=await identity\(req,2\);/g)];
assert.ok(levelGuards.length >= 2, "Post-it reads and writes must independently require Lv2");
assert.match(postit, /const member=await verifiedMember\(req,viewer\);/, "Post-it member state must be validated");
assert.match(postit, /if\(!user\)return fail\(req,"WRITER_IDENTITY_REQUIRED",403\)/, "Post-it writes require verified member");
assert.match(postit, /const \{data,error\}=await db\.auth\.getUser\(jwt\)/, "Post-it account proof uses Supabase Auth");
assert.match(postit, /if\(error\|\|!eligiblePostitAuthUser\(user\)\)return null/, "Post-it must reject banned, deleted and unconfirmed users");
assert.match(postit, /DEVICE_OWNERSHIP_NOT_VERIFIED/, "Post-it ownership proof must be enforced");

assert.match(admin, /await db\.auth\.getUser\(token\)/, "Admin bearer must be verified");
assert.match(admin, /if \(!account\?\.enabled\)/, "Admin account must be enabled");
assert.match(admin, /claims\.aal !== "aal2"/, "Admin MFA check must remain");
assert.match(admin, /beagu_admin_active_mfa_session/, "Admin MFA session must be active");
ordered(admin, "const actor = await checkAdmin(request);", "const action = String(input.action ||", "Authorize admin before dispatching actions");

assert.match(worker, /def isolate_preview_backend\(preview_dir\):/, "Preview backend isolation required");
assert.match(worker, /if live_ref in file\.read_text\(encoding="utf-8"\):/, "Production references must cause preview build failure");
assert.match(worker, /raise RuntimeError\("Production Supabase URL leaked into preview:/, "Preview must fail closed");
assert.match(ui, /request\('verify',\{\},result\.token\)/, "UI must confirm level from server");
assert.match(ui, /request\('verify',\{\},token\)/, "UI must revalidate stored session");

const clientPaths = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(?:js|mjs|html)$/.test(entry.name)) clientPaths.push(path);
  }
}
walk("js");
for (const path of readdirSync(".").filter(s => s.endsWith(".html"))) clientPaths.push(path);
for (const path of clientPaths) {
  const source = read(path);
  assert.doesNotMatch(source, /sb_secret_[a-zA-Z0-9_-]{16,}/, `Secret Supabase key in client: ${path}`);
  assert.doesNotMatch(source, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, `Embedded JWT in client: ${path}`);
}
console.log(`PASS: stage35 static auth/preview/secret boundary checks (${clientPaths.length} client files).`);
console.log("NOT TESTED: live RLS bypass, Lv3 cross-account authorization, staging end-to-end, actual network responses.");
