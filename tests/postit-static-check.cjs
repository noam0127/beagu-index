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
assert.ok(app.includes('state.level>=1'),'Lv1 frontend comment-read gate');
assert.ok(page.includes('댓글은 Lv.1부터'),'clear user-facing comment policy');
assert.ok(css.includes('postit-breeze-flutter')&&css.includes('postit-corner-flutter')&&css.includes('postit-bookmark-flick'),'scroll wind and folded-corner animation exist');
assert.ok(app.includes('flutterOnScroll')&&app.includes('previousScrollY')&&app.includes('breezePreference.matches'),'down-scroll only and reduced-motion gating');
const compare=read('statistics.html'),core=read('js/statistics-compare.js');
assert.match(compare,/id="copyCompareLink"[\s\S]{0,250}id="comparePostit"/,'compare shortcut next to copy');
assert.ok(core.includes("postitUrl.searchParams.set('compare',comparison)"),'comparison state transferred');
assert.ok(core.includes('navigator.clipboard'),'comparison copied');
const cards=read('js/school-search-card-v1.js');
assert.ok(cards.includes('postit.html?school_id='),'search cards link');
for(const file of ['search.html','search-lv1.html','index.html','statistics.html'])
 assert.ok(read(file).includes('href="postit.html"'),'nav on '+file);
for(const file of ['teacher-run.html','teacher-volleyball.html','teacher-class-diary-play.html'])
 assert.ok(read(file).includes('data-postit-game'),'game link in '+file);
// All existing public page menus must expose Post-it, without changing restricted pages.
const menuPages=[
 'index.html','search.html','search-lv1.html','school-report.html',
 'statistics.html','challenge.html','levels.html','arcade-history.html',
 'release-policy.html','survey.html','teacher-run.html',
 'teacher-volleyball.html','postit.html'
];
for(const file of menuPages){
 const pageHtml=read(file);
 const navStart=pageHtml.indexOf('<nav class="beagu-unified-nav"');
 const navEnd=pageHtml.indexOf('</nav>',navStart);
 const nav=navStart>=0&&navEnd>navStart?pageHtml.slice(navStart,navEnd):'';
 assert.ok(nav,'shared nav on '+file);
 assert.ok(nav.includes('href="postit.html"'),'Post-it menu link on '+file);
 const label='>포스트잇</a>';
 assert.ok(nav.includes(label),'Post-it text on '+file);
 const links=['index.html','search.html','statistics.html','postit.html','challenge.html'];
 assert.ok(links.every((target,index)=>nav.indexOf('href="'+target+'"')>=0
  &&(index===0||nav.indexOf('href="'+links[index-1]+'"')<nav.indexOf('href="'+target+'"'))),'five menu item order '+file);
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
assert.ok(page.includes('postit-v1.css?v=20261120-tornpaper1')&&
 page.includes('postit-v1.js?v=20261120-tornpaper2'),'browser loads latest visual assets');

const edge=read('supabase/functions/beagu-postit-api-v1/index.ts');
assert.ok(edge.includes('const user=await identity(req)'), 'writes authenticated');
assert.ok(!edge.includes('identity_visitor_id||hash'), 'session token hash must not become rotating writer identity');
assert.ok(edge.includes('if(!data.identity_visitor_id)return {level:Number(data.access_level),id:null}'),
 'Lv1 can read without identity but no actor UUID is synthesized');
assert.ok(edge.includes('if(!user.id)return fail(req,"WRITER_IDENTITY_REQUIRED",403)'),
 'Lv2 writes fail closed until trusted permanent identity is bound');
assert.ok(app.includes('WRITER_IDENTITY_REQUIRED'), 'client explains pending Lv2 account verification');
assert.ok(edge.includes('const viewer=await identity(req,1)'), 'Lv1 verified server-side for comment reads');
assert.ok(!/\bconst URL\s*=/.test(edge), 'global URL constructor must not be shadowed');
assert.ok(edge.includes('const SUPABASE_URL = Deno.env.get('), 'Supabase URL configured separately');
assert.ok(edge.includes('new URL(req.url)'), 'request URL parsing uses built-in constructor');
assert.ok(edge.includes('COMMENT_READ_LEVEL_REQUIRED'), 'Lv0 comment API denial');
assert.ok(edge.includes('LEVEL_REQUIRED'), 'post author level 2 server gate');
assert.ok(edge.includes('status:"hidden"'), 'report-hide capability');
assert.ok(edge.includes('manual_release_approved'), 'release policy preserved');
assert.ok(edge.includes('school_info'), 'public selected school metadata');
assert.ok(edge.includes('comparison_selection'), 'compare subject persisted');
const migration=read('supabase/migrations/20261120_beagu_postit_school_conversations.sql');
assert.ok(migration.includes('ENABLE ROW LEVEL SECURITY'),'RLS enabled');
assert.ok(migration.includes('REVOKE ALL'),'direct browser access revoked');
console.log('Post-it static validation passed.');