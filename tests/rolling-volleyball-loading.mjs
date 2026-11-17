import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const loader=read('js/beagu-loading-v1.js');
const css=read('styles/beagu-loading-v1.css');
assert.doesNotThrow(()=>new Script(loader), 'loader script parses');
assert.match(css,/@keyframes beagu-ball-roll/);
assert.match(css,/4\.2s ease-in-out infinite alternate/);
assert.match(css,/prefers-reduced-motion:reduce/);
assert.match(css,/beagu-loading-screen\[hidden\]/);
for(const p of ['index.html','search.html','search-lv1.html','school-report.html',
  'statistics.html','challenge.html','survey.html','release-policy.html',
  'teacher-volleyball.html','teacher-run.html']){
  const html=read(p);
  assert.match(html,/styles\/beagu-loading-v1\.css/,p+' loader CSS');
  assert.match(html,/js\/beagu-loading-v1\.js/,p+' loader JS');
}
for(const p of ['search.html','js/level-search.js','school-report.html','js/statistics-table.js']){
  const source=read(p);
  assert.match(source,/BeaguLoading\?\.start/,p+' start request');
  assert.match(source,/BeaguLoading\?\.finish/,p+' finish request');
}
let time=0, nextTimer=0, overlay=null;
const timers=new Map(), docs={}, wins={};
function later(fn,ms){const id=++nextTimer;timers.set(id,{when:time+ms,fn});return id}
function cancel(id){timers.delete(id)}
function tick(ms){
  const end=time+ms;
  for(let i=0;i<200;i++){
    const due=[...timers.entries()].filter(([,x])=>x.when<=end).sort((a,b)=>a[1].when-b[1].when)[0];
    if(!due)break;
    time=due[1].when;timers.delete(due[0]);due[1].fn();
  }
  time=end;
}
const document={
  body:{appendChild(el){overlay=el}},
  createElement(tag){
    assert.equal(tag,'div');
    return {hidden:true,className:'',innerHTML:'',setAttribute(){},
      querySelector(){return {textContent:''}}};
  },
  addEventListener(type,fn){docs[type]=fn}
};
const window={addEventListener(type,fn){wins[type]=fn}};
const context={window,document,URL,location:{href:'https://baeguindex.com/index.html',
  pathname:'/index.html',search:'',origin:'https://baeguindex.com'},
  setTimeout:later,clearTimeout:cancel,performance:{now:()=>time}};
runInNewContext(loader,context);
const loading=window.BeaguLoading;
assert.equal(typeof loading.start,'function');
const quick=loading.start('검색 중');
tick(200);loading.finish(quick);tick(200);
assert.ok(!overlay || overlay.hidden,'quick fetch must not flash overlay');
const slow=loading.start('검색 결과를 확인하는 중…');
tick(350);
assert.equal(overlay.hidden,false,'slow request displays the loader');
assert.match(overlay.innerHTML,/beagu-loading-ball/,'volleyball animation is present');
loading.finish(slow);
tick(299);assert.equal(overlay.hidden,false,'minimum visible duration');
tick(1);assert.equal(overlay.hidden,true,'loader dismissed after fetch');
const resumed=loading.start('다시 검색 중');
wins.pageshow({persisted:false});tick(350);
assert.equal(overlay.hidden,false,'normal initial pageshow must retain pending requests');
loading.finish(resumed);tick(300);
const link={href:'https://baeguindex.com/search.html',target:'',hasAttribute(){return false}};
docs.click({defaultPrevented:false,button:0,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,
 target:{closest(){return link}}});
tick(350);assert.equal(overlay.hidden,false,'internal page transition shows loader when slow');
wins.pagehide();assert.equal(overlay.hidden,true,'pagehide cleans navigation overlay');
console.log('PASS: 350ms delay, rolling volleyball, early completion, navigation and reduced motion');
