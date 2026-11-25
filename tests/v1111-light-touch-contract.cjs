const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const read=p=>fs.readFileSync(p,'utf8');
const expected=['홈','검색','비교','플레이','챌린지'];
const aliases={'홈코트':'홈','학교검색':'검색','학교비교':'비교','플레이코트':'플레이'};
const urls=['index.html','search.html','statistics.html','games.html','challenge.html'];
for(const p of ['index.html','search.html','search-lv1.html','statistics.html','challenge.html','postit.html','games.html','arcade-history.html','levels.html','school-report.html','survey.html','release-policy.html','teacher-volleyball.html','teacher-run.html']){
 const c=read(p),nav=c.match(/<nav\b[^>]*class="[^"]*beagu-unified-nav[^"]*"[^>]*>[\s\S]*?<\/nav>/)[0];
 const a=[...nav.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)];assert.deepEqual(a.map(m=>m[1]),urls,p);assert.deepEqual(a.map(m=>aliases[m[2]]||m[2]),expected,p);
}
const home=read('index.html');assert.doesNotMatch(home,/<iframe\b|id="teacher-game-frame"|id="teacher-run-frame"|배구지수 놀이터/);assert.doesNotMatch(home,/학교별 근무난이도 게임으로 확인하기/);
assert.match(home,/beagu-home-actions[\s\S]*id="beaguTodaySchools"[\s\S]*class="card light-touch-visit"[\s\S]*class="beagu-home-notice"/);assert.doesNotMatch(home,/class="light-touch-home-bottom"/);assert.match(home,/mailto:manatee09@kakao\.com/);
for(const p of ['search.html','search-lv1.html']){
 const s=read(p);const ids=['lightTouchSurveyLink','searchInput','results','beaguInterest'];const ix=ids.map(id=>s.indexOf('id="'+id+'"'));assert.ok(ix.every((v,i)=>v>=0&&(!i||v>ix[i-1])),p+' section order '+ix);
 assert.doesNotMatch(s,/id="beaguTodaySchools"|2026 자료 공개 기준/);assert.match(s,/data-interest-locked="false" data-interest-top-five="true"/);assert.match(s,/survey\.html\?ref=/);
}
const l=read('js/level-search.js');assert.match(l,/generation!==authGeneration\|\|requestToken!==session/);assert.match(l,/if\(mode!=='region'\)\{/);assert.match(l,/mode==='region'&&sortValue.startsWith\('housing_price_won_'\)/);assert.match(l,/api\('ranked_schools',\{searchText:q,region,office,sort,direction,page\}\)/);
const interest=read('js/beagu-school-interest-v1.js');assert.match(interest,/slice\(0,topFive\?5:10\)/);assert.match(interest,/lastToken===getToken\(\)&&verifiedLevel\(\)>=1/);
{const v=JSON.parse(read('release-info.json')).version;assert.equal(v,JSON.parse(read('release-candidate.json')).version);const order=JSON.parse(read('development-roadmap.json')).versions.map(x=>x.version);assert.ok(order.includes('v1.11.2')&&order.indexOf(v)>=order.indexOf('v1.11.2'));}assert.equal(JSON.parse(read('release-info.json')).environment,'candidate');assert.equal(JSON.parse(read('vercel.json')).git.deploymentEnabled,false);
for(const p of ['js/level-search.js','js/beagu-home-schools-v1.js','js/beagu-school-interest-v1.js'])cp.execFileSync(process.execPath,['--check',p]);
const old='5f19ddf28a2f24a98fb03900739147a04a547cbe';
const strip=s=>s.replace(/<nav\b[^>]*class="[^"]*beagu-unified-nav[^"]*"[^>]*>[\s\S]*?<\/nav>/,'').replace(/<link rel="stylesheet" href="styles\/beagu-light-touch-v1111\.css\?v=(?:1111|1110-court)">\n/,'');
// The original v1.11.1 preservation check still runs against its historical
// release baseline. The new candidate has approved game UI changes.
const gitRead=(ref,p)=>cp.execFileSync('git',['show',ref+':'+p],{encoding:'utf8',maxBuffer:20*1024*1024});
const homecourt='497682f2abd359802944f00f187b3f2e81bd4e2d';
for(const p of ['teacher-volleyball.html','teacher-run.html']){
 const baseline=gitRead(homecourt,p),current=p==='teacher-volleyball.html'?gitRead('4dbc473bb49cec3d510ea2fbc58ee24f344b6e1f',p):gitRead('8bc306ae6f4633937a84af6b56f0f000c286fa02',p);
 // Reverse only the explicitly approved UI changes; preserve all other game logic.
 let normalized=current.replace(/arcade-school-picker-v1\.js\?v=1110-court/,'arcade-school-picker-v1.js?v=20261120-fast1').replace(/arcade-leaderboard-v1\.js\?v=1119/,'arcade-leaderboard-v1.js?v=20261123-school-links-live2')
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
  normalized=normalized.replace('\n<link rel="stylesheet" href="styles/arcade-result-share-v1.css?v=11111-replay">','').replace('\n<script src="js/arcade-result-share-v1.js?v=11111"></script>','')
   .replace('\nconst resultView=window.BeaguArcadeResult.create($("choices").parentElement,canvas,{compact:true});','').replace('function message(title,desc,choices,symbol="🎒"){\n resultView.clear();$("choices").classList.remove("arcade-result-replay-row");','function message(title,desc,choices,symbol="🎒"){')
   .replace('{label:"🏫 다른 학교",action:stopAndChangeSchool}],win?celebration.icon:"🫖");\n $("choices").classList.add("arcade-result-replay-row");','{label:"🏫 학교 변경",action:stopAndChangeSchool}],win?celebration.icon:"🫖");')
   .replace(/\n draw\(\);\n resultView\.show\(\{game:"험난한 교직생활 3\.0"[^\n]*\);/,'');
  normalized=normalized.replace('const scoreBefore=score;\n ','').replace('const delta=score-scoreBefore;\n const scoreItem=["salary","bonus","bullying","report"].includes(item.id);\n setNotice((item.good?"🔵":"🔴")+" "+item.name+" · "+(scoreItem?"점수 "+(delta>=0?"+":"")+delta:item.detail),2.2);','setNotice((item.good?"🔵":"🔴")+" "+item.name+" · "+item.detail,2.2);');
 }
 assert.equal(strip(normalized),strip(baseline),p+' unapproved gameplay changes');
}
console.log('PASS v1.11.1 static source, menu, release isolation and game preservation');

// Court tidy: exact same data source and existing API; no automatic game start.
const report=read('school-report.html'),picker=read('js/arcade-school-picker-v1.js'),hub=read('js/beagu-court-tidy-v1110.js');
assert.match(report,/id="reportPostitLink"[^>]*>[^<]*<\/a><a id="reportExperienceLink"/);
assert.match(report,/experience\.hidden=!!state\.demo/);
assert.match(report,/teacher-volleyball\.html\?school_id=/);
assert.match(picker,/String\(school\.school_id\)!==String\(record\.school_id\)/);
assert.match(picker,/this\.serial===0&&!this\.locked/);
assert.match(hub,/searchParams\.set\("school_id",id\)/);
assert.match(read('js/beagu-home-schools-v1.js'),/school\.id!==previousId/);assert.match(read('js/beagu-home-schools-v1.js'),/Math\.random\(\)/);assert.doesNotMatch(read('js/beagu-home-schools-v1.js'),/nextBoundary|setTimeout|PERIOD=24/);assert.doesNotMatch(home,/새로고침마다 변경/);
assert.match(read('styles/beagu-light-touch-v1111.css'),/repeat\(5,minmax\(0,1fr\)\)/);
for(const p of ['js/beagu-court-tidy-v1110.js','js/arcade-school-picker-v1.js'])cp.execFileSync(process.execPath,['--check',p]);
console.log('PASS v1.11.10 court tidy static contracts');

for(const p of ['js/beagu-home-schools-v1.js','js/school-search-card-v1.js']){const source=read(p);assert.match(source,/court-school-experience/);assert.match(source,/teacher-volleyball\.html\?school_id=/);assert.match(source,/학교체험/);}
assert.match(l,/historyHeader\.append\(trigger,experience\)/);

const showcase=read('js/beagu-home-schools-v1.js');assert.match(showcase,/detail\.href=linkFor\(school\.id\)/);assert.match(showcase,/actions\.append\(detail,experience\)/);assert.match(showcase,/footer\.append\(el\('span','beagu-home-school-year','2025년 기준'\),actions\)/);

const fullset=read('styles/beagu-fullset-school-v11111.css');for(const width of [600,1024,1440])assert.ok(fullset.includes('min-width:'+width+'px'));for(const p of ['search.html','search-lv1.html','school-report.html'])assert.match(read(p),/beagu-fullset-school-v11111\.css/);

// Full Set intentionally changes only the volleyball touch/control path; preserve the
// published baseline's server-start, contact, ranking and school selection logic.
const fullVolley=read('teacher-volleyball.html'),publishedVolley=gitRead('4dbc473bb49cec3d510ea2fbc58ee24f344b6e1f','teacher-volleyball.html');
for(const [start,end] of [['  async function startMatch() {',"  function stopForSchoolChange(keepSchool=false){"],['  function controlPlayer(','  function moveClones(']]){const a=publishedVolley.indexOf(start),b=publishedVolley.indexOf(end,a+start.length),c=fullVolley.indexOf(start),d=fullVolley.indexOf(end,c+start.length);assert.ok(a>=0&&b>a&&c>=0&&d>c);assert.equal(fullVolley.slice(c,d).replace('state.maxDeficit=0;',''),publishedVolley.slice(a,b));}
assert.match(fullVolley,/volley-touch-v1\.js\?v=11111/);assert.doesNotMatch(fullVolley,/volley-joystick|조이스틱/);

// 4.0 replacement is explicitly approved; historical preservation checked above.
assert.equal(read("teacher-run.html"),read("teacher-run-4-preview.html"));assert.match(read("teacher-run.html"),/BeaguRun4Rules/);
