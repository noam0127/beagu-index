const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
for(const p of ['index.html','search.html','search-lv1.html','statistics.html','challenge.html']){
 const html=read(p);assert.equal((html.match(/js\/beagu-release-info-v1\.js/g)||[]).length,1);
 assert.match(html,/<a href="games.html">게임<\/a>/);assert.match(html,/학교비교/);
}
assert.match(read('index.html'),/id="teacher-game-title"/);
for(const p of ['search.html','search-lv1.html'])assert.match(read(p),/beagu-search-hero-magnifier/);
assert.match(read('statistics.html'),/beagu-clean-hero-icon/);
const js=read('js/beagu-release-info-v1.js');assert.doesNotMatch(js,/innerHTML|localStorage|sessionStorage|supabase/i);
assert.match(js,/m.environment==='production'&&verified/);
const m=JSON.parse(read('release-info.json'));assert.equal(m.environment,'candidate');assert.equal(m.commit,null);
const roadmap=JSON.parse(read('development-roadmap.json'));const expectedVersions=['v1.2.0','v1.3.0','v1.4.0','v1.5.0','v1.6.0','v1.7.0','v1.8.0','v1.9.0','v1.10.0','v1.10.1','v1.11.0','v1.12.0','v1.13.0','v1.14.0','v2.0.0'];assert.deepEqual(roadmap.versions.map(x=>x.version),expectedVersions);assert.deepEqual(roadmap.versions.map(x=>x.order),expectedVersions.map((_,i)=>i+1));assert.ok(roadmap.versions.find(x=>x.version==='v1.11.0').dependencies.some(x=>x.includes('v1.10.1')));assert.ok(roadmap.inventory.every(x=>x.target_versions.length));
console.log('clean release source contract passed');
