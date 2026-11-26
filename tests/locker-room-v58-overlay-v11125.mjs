import assert from "node:assert/strict";import {readFileSync} from "node:fs";import {stripTypeScriptTypes} from "node:module";import {Script} from "node:vm";
const read=p=>readFileSync(p,"utf8");
const preview=read("supabase/preview/v11125/beagu-level-api/index.ts"),contract=JSON.parse(read("supabase/preview/v11125/v58-source-contract.json"));
assert.equal(contract.source_version,58);assert.equal(contract.edits.length,4);
let reversed=preview;for(const edit of [...contract.edits].reverse()){assert.equal(reversed.split(edit.after).length,2);reversed=reversed.replace(edit.after,()=>edit.before);}
assert.doesNotMatch(reversed,/level3_register|level3_login/);
assert.match(preview,/beagu_lv3_register_v1/);assert.match(preview,/BEAGU_LEVEL3_ENABLED/);
assert.match(preview,/beagu_has_earned_challenge_visitor/);
assert.match(preview,/accountLevel:lv3Enabled\(\)&&session.level3_account_id\?3:session.access_level/);
const actions=s=>[...s.matchAll(/body\.action==='([^']+)'/g)].map(m=>m[1]);assert.deepEqual(actions(preview).filter(a=>!["level3_register","level3_login"].includes(a)),actions(reversed));
const code=stripTypeScriptTypes(preview).replace(/^import .*;\s*$/gm,"");new Script(code);
console.log("PASS v58 minimal Lv3 overlay: existing action surface unchanged, feature flag and TypeScript syntax preserved");
