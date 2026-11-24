const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const read=p=>fs.readFileSync(p,'utf8');
const expected=['홈','학교검색','학교비교','포스트잇','학교체험','챌린지'];
const urls=['index.html','search.html','statistics.html','postit.html','games.html','challenge.html'];
for(const p of ['index.html','search.html','search-lv1.html','statistics.html','challenge.html','postit.html','games.html','arcade-history.html','levels.html','school-report.html','survey.html','release-policy.html','teacher-volleyball.html','teacher-run.html']){
 const c=read(p),nav=c.match(/<nav\b[^>]*class="[^"]*beagu-unified-nav[^"]*"[^>]*>[\s\S]*?<\/nav>/)[0];
 const a=[...nav.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)];assert.deepEqual(a.map(m=>m[1]),urls,p);assert.deepEqual(a.map(m=>m[2]),expected,p);
}
const home=read('index.html');assert.doesNotMatch(home,/<iframe\b|id="teacher-game-frame"|id="teacher-run-frame"|배구지수 놀이터/);assert.match(home,/href="games.html">학교별 근무난이도 게임으로 확인하기/);
assert.match(home,/light-touch-home-bottom[\s\S]*beagu-home-notice[\s\S]*light-touch-visit/);assert.match(home,/mailto:manatee09@kakao\.com/);
for(const p of ['search.html','search-lv1.html']){
 const s=read(p);const ids=['lightTouchSurveyLink','searchInput','results','beaguTodaySchools','beaguInterest'];const ix=ids.map(id=>s.indexOf('id="'+id+'"'));assert.ok(ix.every((v,i)=>v>=0&&(!i||v>ix[i-1])),p+' section order '+ix);
 assert.match(s,/data-interest-locked="false" data-interest-top-five="true"/);assert.match(s,/survey\.html\?ref=/);
}
const l=read('js/level-search.js');assert.match(l,/generation!==authGeneration\|\|requestToken!==session/);assert.match(l,/if\(mode!=='region'\)\{/);assert.match(l,/mode==='region'&&sortValue.startsWith\('housing_price_won_'\)/);assert.match(l,/api\('ranked_schools',\{searchText:q,region,office,sort,direction,page\}\)/);
const interest=read('js/beagu-school-interest-v1.js');assert.match(interest,/slice\(0,topFive\?5:10\)/);assert.match(interest,/lastToken===getToken\(\)&&verifiedLevel\(\)>=1/);
assert.equal(JSON.parse(read('release-info.json')).version,'v1.11.2');assert.equal(JSON.parse(read('release-info.json')).environment,'candidate');assert.equal(JSON.parse(read('vercel.json')).git.deploymentEnabled,false);
for(const p of ['js/level-search.js','js/beagu-home-schools-v1.js','js/beagu-school-interest-v1.js'])cp.execFileSync(process.execPath,['--check',p]);
const old='5f19ddf28a2f24a98fb03900739147a04a547cbe';
const strip=s=>s.replace(/<nav\b[^>]*class="[^"]*beagu-unified-nav[^"]*"[^>]*>[\s\S]*?<\/nav>/,'').replace(/<link rel="stylesheet" href="styles\/beagu-light-touch-v1111\.css\?v=1111">\n/,'');
for(const p of ['teacher-volleyball.html','teacher-run.html'])assert.equal(strip(read(p)),strip(cp.execFileSync('git',['show',old+':'+p],{encoding:'utf8',maxBuffer:20*1024*1024})),p+' gameplay unchanged');
console.log('PASS v1.11.1 static source, menu, release isolation and game preservation');
