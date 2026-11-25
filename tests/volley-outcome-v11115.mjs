import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const backend=read('supabase/functions/arcade-leaderboard/index.ts');
const start=backend.indexOf('function publicGameResult('),end=backend.indexOf('async function gameHistory(',start);
assert.ok(start>=0&&end>start);
const project=new Function(backend.slice(start,end).replace('game:Game,result:any):Record<string,unknown>','game,result)')+'\nreturn publicGameResult;')();
for(const f of [{victory:true,player:25,cpu:24},{victory:false,player:24,cpu:25},{victory:false,endedEarly:true,player:12,cpu:14}]){
 const r=project('volleyball_25',{...f,session_id:'secret',ip_hash:'secret'});
 assert.equal(r.outcome,f.victory?'victory':f.endedEarly?'stopped':'defeat');
 assert.equal(r.playerPoints,f.player);assert.equal(r.cpuPoints,f.cpu);
 assert(!Object.hasOwn(r,'session_id')&&!Object.hasOwn(r,'ip_hash')&&!Object.hasOwn(r,'matchRule'));
}
const client=read('js/arcade-leaderboard-v1.js');const c=client.slice(client.indexOf('function outcomeInfo('),client.indexOf('function orderFast('));const api=new Function('el',c+'\nreturn {outcomeInfo,outcomeLabel};')((tag,cls,text)=>({tag,cls,text}));
assert.equal(api.outcomeLabel(api.outcomeInfo({outcome:'victory',playerPoints:26,cpuPoints:24,deuce:true})).text,'듀스 승리 26:24');assert.equal(api.outcomeLabel(api.outcomeInfo({outcome:'defeat',playerPoints:23,cpuPoints:25})).text,'패배 23:25');assert.equal(api.outcomeLabel(api.outcomeInfo({outcome:'stopped',playerPoints:12,cpuPoints:14})).text,'중도 종료 12:14');assert.equal(api.outcomeLabel(api.outcomeInfo({})).text,'결과 미확인');assert.equal(api.outcomeLabel(api.outcomeInfo({},true)).text,'승리');
assert.match(backend,/select:"score,created_at,school_id,school_name,difficulty"/);assert.match(backend,/details:record.public_result/);assert.match(client,/school.append\(outcomeLabel\(entry\)\)/);assert.match(read('js/arcade-history-v1.js'),/label\+visibleScore/);console.log('PASS legacy public gameplay projection, client outcome labels and missing result fallback, privacy');
