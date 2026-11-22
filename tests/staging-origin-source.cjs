"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");
const paths=[
 "supabase/functions/beagu-level-api/index.ts",
 "supabase/functions/beagu-postit-api-v1/index.ts",
 "supabase/functions/beagu-admin-access/index.ts",
 "supabase/functions/beagu-admin-dashboard-v1/index.ts",
 "supabase/functions/beagu-admin-members-v1/index.ts",
 "supabase/functions/beagu-telemetry-v2/index.ts",
];
for(const path of paths){
 const code=fs.readFileSync(path,"utf8");
 assert.match(code,/import \{ isBrowserOriginAllowed \} from "\.\.\/_shared\/staging-origin\.ts"/);
 assert.match(code,/isBrowserOriginAllowed\(origin, (allowed|origins)\)/);
 assert.doesNotMatch(code,/\b(?:allowed|origins)\.has\(origin\)/,
   "All CORS decisions must be project-isolated in "+path);
 assert.match(code,/origin_not_allowed|ORIGIN_NOT_ALLOWED/i);
 assert.match(code,/Access-Control-Allow-Origin/);
 assert.match(code,/OPTIONS/);
 console.log("PASS "+path+" has both deny gate and CORS preflight in shared project-scoped policy");
}
const helper=fs.readFileSync("supabase/functions/_shared/staging-origin.ts","utf8");
assert.match(helper,/BEAGU_STAGING_ALLOWED_ORIGIN/);
assert.match(helper,/STAGING_PROJECT_URL/);
assert.match(helper,/existing\.has\(origin\)/);
assert.doesNotMatch(helper,/\.onrender\.com\/\*\*/);
console.log("PASS 6 Edge Function sources preserve stage-only exact-origin CORS gate");
