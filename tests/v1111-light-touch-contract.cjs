const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const read=p=>fs.readFileSync(p,'utf8');
const expected=['홈코트','학교검색','학교비교','라커룸','플레이코트','챌린지'];
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
{const v=JSON.parse(read('release-info.json')).version;assert.equal(v,JSON.parse(read('release-candidate.json')).version);const order=JSON.parse(read('development-roadmap.json')).versions.map(x=>x.version);assert.ok(order.includes('v1.11.2')&&order.indexOf(v)>=order.indexOf('v1.11.2'));}assert.equal(JSON.parse(read('release-info.json')).environment,'candidate');assert.equal(JSON.parse(read('vercel.json')).git.deploymentEnabled,false);
for(const p of ['js/level-search.js','js/beagu-home-schools-v1.js','js/beagu-school-interest-v1.js'])cp.execFileSync(process.execPath,['--check',p]);
const old='5f19ddf28a2f24a98fb03900739147a04a547cbe';
const strip=s=>s.replace(/<nav\b[^>]*class="[^"]*beagu-unified-nav[^"]*"[^>]*>[\s\S]*?<\/nav>/,'').replace(/<link rel="stylesheet" href="styles\/beagu-light-touch-v1111\.css\?v=1111">\n/,'');
// The original v1.11.1 preservation check still runs against its historical
// release baseline. The new candidate has approved game UI changes.
const gitRead=(ref,p)=>cp.execFileSync('git',['show',ref+':'+p],{encoding:'utf8',maxBuffer:20*1024*1024});
const homecourt='497682f2abd359802944f00f187b3f2e81bd4e2d';
for(const p of ['teacher-volleyball.html','teacher-run.html']){
 const baseline=gitRead(homecourt,p),current=read(p);
 // Reverse only the explicitly approved UI changes; preserve all other game logic.
 let normalized=current.replace(/arcade-leaderboard-v1\.js\?v=1119/,'arcade-leaderboard-v1.js?v=20261123-school-links-live2')
 .replace(/arcade-mystery-items-v1\.js\?v=1116/,p.includes('volleyball')?'arcade-mystery-items-v1.js?v=20261123-items':'arcade-mystery-items-v1.js?v=20261123-arcade-items3');
 const link=baseline.match(/<a class="postit-arcade-link postit-lv2-link"[^>]*>[^<]*<\/a>/)?.[0];
 assert.ok(link);assert.ok(!normalized.includes('class="postit-arcade-link postit-lv2-link"'));
 const at=baseline.indexOf(link),prefix=baseline.slice(Math.max(0,at-40),at),suffix=baseline.slice(at+link.length,at+link.length+40);
 assert.ok(normalized.includes(prefix+suffix),p+' removed link location');
 normalized=normalized.replace(prefix+suffix,prefix+link+suffix);
 if(p.includes('volleyball')){
  normalized=normalized.replace('aria-label="게임 방법" title="게임 방법"','aria-label="조작법" title="조작법"')
   .replace('const affectsScore=["bullying","report","salary","bonus"].includes(item.id);\n    setStatus((side==="left"?"나":"상대")+" 획득: "+item.icon+" "+item.name+" · "+(side==="right"&&affectsScore?"내 점수 변동 없음":item.detail));','setStatus((side==="left"?"나":"상대")+" 획득: "+item.icon+" "+item.name);');
 }else{
  normalized=normalized.replace('const scoreBefore=score;\n ','').replace('const delta=score-scoreBefore;\n const scoreItem=["salary","bonus","bullying","report"].includes(item.id);\n setNotice((item.good?"🔵":"🔴")+" "+item.name+" · "+(scoreItem?"점수 "+(delta>=0?"+":"")+delta:item.detail),2.2);','setNotice((item.good?"🔵":"🔴")+" "+item.name+" · "+item.detail,2.2);');
 }
 assert.equal(strip(normalized),strip(baseline),p+' unapproved gameplay changes');
}
console.log('PASS v1.11.1 static source, menu, release isolation and game preservation');
