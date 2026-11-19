// Static contract checks for shared level-up and provisional Lv.2 safety.
const fs=require('node:fs'); const assert=require('node:assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
const server=read('supabase/functions/beagu-level-api/index.ts');
const shell=read('js/beagu-level-state-v1.js');
const post=read('js/postit-v1.js');
const api=read('supabase/functions/beagu-postit-api-v1/index.ts');
assert.match(server,/beagu_check_class_diary_guest_code/);
assert.match(server,/identity_visitor_id/);
assert.match(server,/provisional:Number\(session\.access_level\)>=2&&!session\.identity_visitor_id/);
assert.match(server,/beagu_consume_login_budget/);
assert.match(shell,/Lv\.2\(진\)/);
assert.match(shell,/data-beagu-open-levelup/);
assert.match(shell,/sessionStorage\.setItem\(KEY,result\.token\)/);
assert.match(shell,/Lv\.1 · 2026 참가/);
assert.match(shell,/Lv\.2 · 챌린지/);
assert.match(post,/state\.level>=2&&!provisional/);
assert.match(api,/if\(!user\.id\)return fail\(req,"WRITER_IDENTITY_REQUIRED",403\)/);
console.log('Provisional Lv2 and shared level-up gate contract: OK');
