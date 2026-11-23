const assert = require("node:assert/strict");
const fs = require("node:fs");
const api = fs.readFileSync("supabase/functions/beagu-admin-members-v1/index.ts","utf8");
const sql = fs.readFileSync("supabase/migrations/20261122020000_admin_member_directory_v2.sql","utf8");
assert.match(api,/email: maskedEmail\(user\.email\)/);
assert.match(api,/Number\.isSafeInteger\(requestedPage\)/);
assert.match(sql,/jsonb_agg\(to_jsonb\(p\) - 'page_ordinal' order by p\.page_ordinal\)/);
assert.match(sql,/grant execute on function public\.beagu_admin_member_directory_v2/);
console.log("PASS: directory privacy and pagination static contract");
