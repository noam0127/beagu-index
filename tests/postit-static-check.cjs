const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
function read(f){return fs.readFileSync(f,'utf8')}
for(const f of ['js/postit-v1.js','js/postit-entry-links-v1.js','js/statistics-compare.js','js/school-search-card-v1.js','js/arcade-school-picker-v1.js']){
 cp.execFileSync(process.execPath,['--check',f],{stdio:'inherit'});
}
const page=read('postit.html'),css=read('styles/postit-v1.css'),app=read('js/postit-v1.js');
for(const id of ['postitThread','postitBody','postitSubjectPicker','postitLocked','postitSubmit','postitSchoolResults','postitSort'])
 assert.match(page,new RegExp('id="'+id+'"'),id+' element exists');
for(const style of ['postit-thread','postit-paper','bookmark-comment','postit-string-stretch','prefers-reduced-motion'])
 assert.ok(css.includes(style),style+' styling exists');
assert.ok(css.includes('#fff1a0')&&css.includes('#ffccd9')&&css.includes('#b9e5fa'),'real-world sticky note palette');
assert.ok(app.includes('encodeURIComponent(comp.selection)'),'compare route');
assert.ok(app.includes('school-report.html?school_id='),'school report route');
assert.ok(app.includes('LEVEL_REQUIRED'),'level gate feedback');
assert.ok(app.includes('COMMENT_READ_LEVEL_REQUIRED'),'Lv0 comment feedback');
assert.ok(app.includes('function canRead(){return state.level>=2 && state.accountReadable===true && state.accountToken===token()}'),'Lv2 frontend reader gate');
assert.match(page,/<section class="postit-account" id="postitAccount"[^>]*\bhidden\b/,'Unreleased Post-it sign-in UI is hidden');
assert.ok(page.includes('Lv.2 익명 계정 인증 후 이용할 수 있습니다.'),'Lv2 reading and pending writing explained');
assert.ok(app.includes('"글쓰기 준비 중"'),'Unreleased writing flow has no login prompt');
assert.ok(css.includes('postit-breeze-flutter')&&css.includes('postit-corner-flutter')&&css.includes('postit-bookmark-flick'),'scroll wind and folded-corner animation exist');
assert.ok(app.includes('flutterOnScroll')&&app.includes('previousScrollY')&&app.includes('breezePreference.matches'),'down-scroll only and reduced-motion gating');
const compare=read('statistics.html'),core=read('js/statistics-compare.js');
assert.match(compare,/id="copyCompareLink"[\s\S]{0,250}id="comparePostit"/,'compare shortcut next to copy');
assert.ok(core.includes("postitUrl.searchParams.set('compare',comparison)"),'comparison state transferred');
assert.ok(core.includes('navigator.clipboard'),'comparison copied');
const cards=read('js/school-search-card-v1.js');
assert.ok(cards.includes('school-report.html?school_id='),'search cards retain school detail route for contextual Post-it');
// v1.11.10: the locker room is intentionally absent from navigation.
// Contextual links and the server-side Lv.2 gate remain intact.
assert.match(read("school-report.html"),/id="reportLockerLinks"/);
assert.ok(read("js/locker-school-links-v11125.js").includes("postit.html?school_id="));
assert.ok(read("school-report.html").includes("BeaguLockerSchoolLinks?.create(String(school.school_id),true)"));
assert.ok(read('teacher-class-diary-play.html').includes('data-postit-game'),'retained diary shortcut');
for(const file of ['teacher-run.html','teacher-volleyball.html'])
 assert.ok(!read(file).includes('data-postit-game'),'v1.11.9 approved removal of arcade shortcut '+file);
const menuPages=[
 'index.html','search.html','search-lv1.html','school-report.html',
 'statistics.html','challenge.html','levels.html','arcade-history.html',
 'release-policy.html','survey.html','teacher-run.html',
 'teacher-volleyball.html','postit.html','games.html'
];
for(const file of menuPages){
 const nav=Array.from(read(file).matchAll(/<nav\b[^>]*class="([^"]*)"[^>]*>[\s\S]*?<\/nav>/g))
  .find(m=>m[1].split(/\s+/).includes('beagu-unified-nav'))?.[0]||'';
 assert.ok(nav,'shared nav on '+file);
 assert.doesNotMatch(nav,/href="postit\.html"/,'locker room hidden '+file);
 const links=['index.html','search.html','statistics.html','games.html','challenge.html'];
 assert.deepEqual([...nav.matchAll(/<a href="([^"]+)"/g)].map(m=>m[1]),links,'preserved five menu destinations '+file);
}
const headerCSS=read('styles/beagu-site-header-v1.css');
assert.ok(headerCSS.includes('grid-template-columns:repeat(5,minmax(0,1fr))'),'mobile 5 tabs in one row');
assert.ok(css.includes('clip-path:polygon('),'irregular hand-torn paper edges');
assert.ok(css.includes('nth-child(3n+2) .postit-paper')&&css.includes('nth-child(3n+3) .postit-paper'),
 'paper tear edge varies across notes');
assert.ok(css.includes('paper-tape')&&app.includes('entry.append(tape,paper)'),
 'taped papers are included in every list entry');
assert.ok(css.includes('fonts.googleapis.com')&&css.includes('"Gaegu"'),
 'handwritten Korean memo font loaded with a legible fallback');
assert.ok(css.includes('postit-paper::before')&&css.includes('postit-paper::after'),
 'subtle creases and folded corner');
assert.ok(page.includes('styles/postit-v1.css?v=')&&
 page.includes('js/postit-v1.js?v='),'browser loads versioned Post-it visual assets');

// Post-it styling is intentionally isolated to /postit.html and its nav tab.
// Challenge preserves its independent blue-and-white certificate/card UI.
const challenge=read('challenge.html');
assert.ok(!challenge.includes('styles/challenge-postit-unity-v1.css'),
 'Challenge must not load Post-it paper overrides');
assert.doesNotMatch(challenge.match(/<nav\b[^>]*class="[^"]*beagu-unified-nav[^"]*"[^>]*>[\s\S]*?<\/nav>/)[0],/href="postit\.html"/,'Challenge hides locker room only in navigation');
assert.ok(challenge.includes('styles/beagu-site-header-v1.css'),
 'Shared navigation remains available');
for(const id of ['challengeAccessPanel','challengeProtected','certificate','participantNo',
 'challengeIdentityPanel','identityCode','copyIdentityCode','capture']) {
 assert.ok(challenge.includes('id="'+id+'"'),'Challenge functional DOM preserved: '+id);
}
assert.ok(challenge.includes('data-html2canvas-ignore="true"'),
 'Private identity remains outside exported certificate');
assert.ok(!challenge.includes('기존 Lv.2(임시) 상태는 유지됩니다.'),
 'Removed redundant temporary-level note from Challenge');
assert.ok(!challenge.includes('class="challenge-lv2-pending"'),
 'Do not render an empty account-explanation card');
assert.ok(!challenge.includes('Lv.2(진)'), 'Retired Level 2 label is absent');
assert.ok(challenge.includes('id="challengeAccessPanel"') &&
 challenge.includes('id="challengeAccessBadge"') &&
 challenge.includes('id="challengeLogout"'),
 'Verification, server level and logout are in the same visible panel');
assert.ok(!challenge.includes('data-beagu-open-levelup>레벨업 인증</button>'),
 'A second upgrade button must not appear below the private code');
assert.ok(read('js/challenge-access-v1.js').includes("getElementById('challengeAccessForm')"),
 'The challenge access script attaches to the preserved challenge form');
assert.ok(challenge.includes('.step-card {')&&challenge.includes('border-radius: 16px;'),
 'Challenge retains rounded standard cards');

const edge=read('supabase/functions/beagu-postit-api-v1/index.ts');
assert.ok(edge.includes('const user=await verifiedMember(viewer)'), 'mutations require independent verified anonymous account');
assert.ok(!edge.includes('identity_visitor_id||hash'), 'session token hash must not become rotating writer identity');
assert.ok(edge.includes('if(accountError||account?.level!==2||account?.lv2_active!==true)return null'),
 'Anonymous account session verified independently of the level token');
assert.ok(edge.includes('if(!user)return fail(req,"WRITER_IDENTITY_REQUIRED",403)'),
 'Lv2 writes fail closed until trusted permanent identity is bound');
assert.ok(app.includes('WRITER_IDENTITY_REQUIRED'), 'client explains pending Lv2 account verification');
assert.ok(edge.includes('const viewer=await identity(req,2)'), 'Lv2 verified server-side for Post-it reads');
assert.ok(!/\bconst URL\s*=/.test(edge), 'global URL constructor must not be shadowed');
assert.ok(edge.includes('const SUPABASE_URL = Deno.env.get('), 'Supabase URL configured separately');
assert.ok(edge.includes('new URL(req.url)'), 'request URL parsing uses built-in constructor');
assert.ok(edge.includes('if(!viewer)return fail(req,"LEVEL_REQUIRED",403)'), 'unauthorized reads fail closed');
assert.ok(edge.includes('LEVEL_REQUIRED'), 'post author level 2 server gate');
assert.ok(edge.includes('status:"hidden"'), 'report-hide capability');
assert.ok(edge.includes('manual_release_approved'), 'release policy preserved');
assert.ok(edge.includes('school_info'), 'Lv2 selected school metadata');
assert.ok(edge.includes('comparison_selection'), 'compare subject persisted');
const migration=read('supabase/migrations/20261120_beagu_postit_school_conversations.sql');
assert.ok(migration.includes('ENABLE ROW LEVEL SECURITY'),'RLS enabled');
assert.ok(migration.includes('REVOKE ALL'),'direct browser access revoked');

// All searching happens behind the same Lv2 server read gate.
for(const id of ['postitSearch','postitSearchForm','postitBoardLocked','postitBoardContent'])
 assert.ok(page.includes('id="'+id+'"'), 'postit search/level UI '+id);
assert.ok(app.includes('query.q=term')&&app.includes('searchDebounce=setTimeout'), 'debounced post search');
assert.ok(app.includes('state.posts=[];host.replaceChildren()'), 'downgrade purges post content');
for(const filter of ['body.ilike.','school_id.in.','comparison_selection.ilike.','id.in.','game_slug.in.'])
 assert.ok(edge.includes(filter), 'server-side search '+filter);
console.log('Post-it static validation passed (Lv2 search).');
