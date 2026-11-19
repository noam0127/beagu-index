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
assert.match(shell,/Lv\.2\(임시\)/,'Use the user-facing temporary Level 2 label');
assert.doesNotMatch(shell,/Lv\.2\(진\)/,'Retired Level 2 label must not reappear');
assert.doesNotMatch(shell,/data-beagu-open-levelup|beaguLevelUpOverlay|window\.BeaguLevelUp/,
 'No identity-code entry modal is injected globally');
assert.match(shell,/const VERIFY_URL=/,'Level badge still verifies a valid server-side session');
assert.match(shell,/action:'verify'/,'Level badge remains read-only');
assert.match(read('levels.html'),/레벨1 인증/);
assert.match(read('levels.html'),/챌린지 · 고유번호 확인/);
assert.match(post,/function canWrite\(\)\{return state\.level>=2 && .*?\.dataset\.provisional!=="true"\}/);
assert.match(post,/const blocked=!canWrite\(\)/);
assert.match(post,/if\(!canWrite\(\)\)composer\.append/);
assert.match(post,/if\(state\.busy\|\|!state\.subject\|\|!canWrite\(\)\)return/);
assert.match(api,/if\(!user\.id\)return fail\(req,"WRITER_IDENTITY_REQUIRED",403\)/);
console.log('Provisional Lv2 and shared level-up gate contract: OK');
