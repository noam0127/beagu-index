'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {runInNewContext}=require('node:vm');
const visit=fs.readFileSync('js/visit-stats.js','utf8');
const games=fs.readFileSync('js/beagu-presence-games-v1.js','utf8');
const calls=[];
const cells=['today','month','total'].map(stat=>({dataset:{stat},textContent:'집계 중'}));
const window={setTimeout(fn){this.delayed=fn},setInterval(){},beaguVisitor:null};
const document={querySelectorAll:()=>cells,addEventListener(){},visibilityState:'visible'};
const client={functions:{invoke:async(name,opts)=>{
  calls.push({name,body:opts.body});
  if(opts.body.action==='visit')return {data:{today:7,month:91,total:1000},error:null};
  return {data:{ok:true},error:null};
}}};
const context={window,document,AbortController,setTimeout,clearTimeout,localStorage:{getItem:()=>null,setItem(){}},
  sessionStorage:{getItem:()=>null,setItem(){}},crypto:{randomUUID:()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},
  location:{pathname:'/'},supabaseClient:client};
runInNewContext(visit,context);
(async()=>{
 await window.beaguVisitReady;
 assert.equal(calls.length,1);
 assert.equal(calls[0].name,'beagu-telemetry-v2');
 assert.equal(calls[0].body.action,'visit');
 assert.equal(calls[0].body.page,'index');
 assert.equal(calls[0].body.event,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 assert.equal(cells[0].textContent,'7');
 assert.equal(cells[1].textContent,'91');
 assert.equal(cells[2].textContent,'1,000');
 await window.delayed();
 assert.equal(calls.length,2);
 assert.equal(calls[1].body.action,'ping');
 assert.doesNotMatch(visit,/\.rpc\(['"]beagu_(record_visit|presence_ping_v1)/);
 const gameCalls=[];
 let gamePing=()=>{};
 runInNewContext(games,{
   window:{setTimeout(fn){gamePing=fn},setInterval(){}},
   document:{visibilityState:'visible',addEventListener(){}},
   location:{pathname:'/teacher-volleyball.html'},
   localStorage:{getItem:()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',setItem(){}},
   sessionStorage:{getItem:()=>null,setItem(){}},
   crypto:{randomUUID:()=> 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'},
   supabaseClient:{functions:{invoke:async(n,o)=>{gameCalls.push({n,o});return {data:{ok:true}}}}}
 });
 await gamePing();
 assert.equal(gameCalls.length,1);
 assert.equal(gameCalls[0].n,'beagu-telemetry-v2');
 assert.equal(gameCalls[0].o.body.page,'volleyball');
 assert.equal(gameCalls[0].o.body.action,'ping');
 console.log('PASS: visit counters, heartbeat, game heartbeat use Edge gateway');
})().catch(e=>{console.error(e);process.exitCode=1});
