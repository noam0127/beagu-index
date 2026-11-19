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
const edge=read('supabase/functions/beagu-postit-api-v1/index.ts');
assert.ok(edge.includes('const user=await identity(req)'), 'writes authenticated');
assert.ok(edge.includes('LEVEL_REQUIRED'), 'post author level 2 server gate');
assert.ok(edge.includes('status:"hidden"'), 'report-hide capability');
assert.ok(edge.includes('manual_release_approved'), 'release policy preserved');
assert.ok(edge.includes('school_info'), 'public selected school metadata');
assert.ok(edge.includes('comparison_selection'), 'compare subject persisted');
const migration=read('supabase/migrations/20261120_beagu_postit_school_conversations.sql');
assert.ok(migration.includes('ENABLE ROW LEVEL SECURITY'),'RLS enabled');
assert.ok(migration.includes('REVOKE ALL'),'direct browser access revoked');
console.log('Post-it static validation passed.');