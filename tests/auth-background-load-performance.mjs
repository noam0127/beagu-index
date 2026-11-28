import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
for(const path of ['js/visit-stats.js','js/beagu-presence-games-v1.js']){
  let now=1000;
  const calls=[],timers=[],handlers={};
  const storage={getItem:()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',setItem(){}};
  const window={setTimeout(fn){timers.push(fn)},setInterval(fn){handlers.interval=fn}};
  const document={querySelectorAll:()=>[],visibilityState:'visible',addEventListener(k,fn){handlers[k]=fn}};
  const supabaseClient={functions:{invoke:async(name,{body})=>{
    assert.equal(name,'beagu-telemetry-v2');
    calls.push(body.action);
    return {data:body.action==='visit'?{today:1,month:1,total:1}:{ok:true}};
  }}};
  vm.runInNewContext(readFileSync(path,'utf8'),{window,document,localStorage:storage,sessionStorage:storage,AbortController,setTimeout,clearTimeout,
    crypto:{randomUUID:()=> 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'},
    location:{pathname:path.includes('games')?'/teacher-run.html':'/'},supabaseClient,Date:{now:()=>now}});
  if(window.beaguVisitReady)await window.beaguVisitReady;
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  const pings=()=>calls.filter(x=>x==='ping').length;
  timers[0]();await flush();handlers.visibilitychange();handlers.interval();await flush();
  assert.equal(pings(),1);
  now+=59999;handlers.visibilitychange();await flush();assert.equal(pings(),1);
  now++;handlers.interval();await flush();assert.equal(pings(),2);
  document.visibilityState='hidden';now+=60000;handlers.interval();await flush();assert.equal(pings(),2);
  assert.equal(calls.filter(x=>x==='visit').length,path.includes('games')?0:1);
}
const compare=readFileSync('js/statistics-compare.js','utf8');
const challenge=readFileSync('js/challenge.js','utf8');
assert.match(compare,/setTimeout\(\(\)=>\{\s*if\(epoch!==state\.authEpoch\|\|state\.sessionToken!==token\)return;\s*refreshApprovedSelections\(\)/);
assert.match(challenge,/setTimeout\(\(\)=>\{\s*if\(!accessGranted\|\|epoch!==grantEpoch\|\|currentSession\(\)!==token\)return;\s*void prepare\(\)/);
console.log('PASS: presence throttling, visit preservation, deferred authenticated data guards');
