import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const civic=read('js/beagu-2026-civic-v1.js');assert.match(civic,/의심 데이터 신고/);assert.doesNotMatch(civic,/civicCorrect|civicStatus|civicForm/);
for(const p of ['search.html','search-lv1.html']){assert.match(read(p),/data-interest-top-ten="true"/);assert.doesNotMatch(read(p),/상위 5개 (학교|지역)/);}
assert.match(read('js/beagu-school-interest-v1.js'),/slice\(0,10\)/);
assert.match(read('js/beagu-region-interest-v1.js'),/top5_v1/);assert.match(read('js/beagu-region-interest-v1.js'),/top10_v1/);assert.match(read('js/beagu-region-interest-v1.js'),/slice\(0,limit\)/);assert.doesNotMatch(read('js/beagu-region-interest-v1.js'),/String\(i\+1\)\+'위'/);
assert.match(read('supabase/region-interest-top10-v11119.sql'),/limit 10/);
assert.match(read('styles/school-glory-v1.css'),/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
const report=read('school-report.html');assert.ok(report.indexOf('id="reportSchoolLikes"')<report.indexOf('<div class="hero-foot">'));
assert.equal((report.match(/id="reportSchoolLikes"/g)||[]).length,1);
for(const p of ['teacher-volleyball.html','teacher-run.html','teacher-run-4-preview.html']){const s=read(p);assert.match(s,/bgm.getContext\(\)/);assert.match(s,/bgm.unlock\(\)/);for(const m of s.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);}
let contexts=0,resumes=0;const events=new Map();class Context{constructor(){contexts++;this.state='interrupted';this.destination={};this.currentTime=0;}createGain(){return{gain:{value:0,cancelScheduledValues(){},setValueAtTime(){}},connect(){},disconnect(){}}}resume(){resumes++;this.state='running';return Promise.resolve();}close(){return Promise.resolve();}}
const window={AudioContext:Context},document={hidden:false,addEventListener(n,f){events.set(n,f)},removeEventListener(n){events.delete(n)}};
vm.runInNewContext(read('js/arcade-fire-court-bgm-v1.js'),{window,document,setInterval(){return 1},clearInterval(){}});
const bgm=window.BeaguFireCourtBgm.create('volleyball');const ctx=bgm.unlock();assert.equal(ctx,bgm.getContext());assert.equal(bgm.unlock(),ctx);assert.equal(contexts,1);assert.equal(resumes,1);bgm.dispose();
console.log('PASS court report, compact ranking, 2x2, counter layout, shared gesture audio contracts');

const info=JSON.parse(read('release-info.json')),manifest=JSON.parse(read('release-candidate.json'));assert.ok(['v1.11.22','v1.11.23'].includes(info.version));assert.equal(info.version,manifest.version);assert.equal(info.name,info.version==='v1.11.22'?'바른 안내':'나의 계정');assert.equal(info.environment,'candidate');assert.equal(info.commit,null);
