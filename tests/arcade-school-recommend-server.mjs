import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const s=readFileSync('supabase/functions/arcade-leaderboard/index.ts','utf8'),a=s.indexOf('const recommendationCache='),b=s.indexOf('// Admin identity is derived',a);assert.ok(a>=0&&b>a);
const code=s.slice(a,b).replace('new Map<string,{until:number,schools:SchoolChoice[]}>()','new Map()').replace('new Map<string,Promise<SchoolChoice[]>>()','new Map()').replace('tier:Difficulty):Promise<SchoolChoice|null>','tier)').replace(' as Array<{school_id:string}>','').replace('const found:SchoolChoice[]','const found');
let queries=0,calls=0;const db=async path=>{queries++;const p=new URLSearchParams(path.split('?')[1]);assert.equal(p.get('publication_status'),'eq.PUBLISHED');assert.equal(p.get('privacy_reviewed'),'eq.true');assert.equal(p.get('limit'),'120');return Array.from({length:12},(_,i)=>({school_id:String(i)}));};
const resolveSchool=async id=>{calls++;return {school_id:id,school_name:'Fixture',eligible:true,difficulty:'hard'};};
const recommend=new Function('db','resolveSchool',code+'\nreturn recommendSchool;')(db,resolveSchool);
const out=await Promise.all([recommend('hard'),recommend('hard')]);assert.ok(out.every(x=>x?.eligible&&x.difficulty==='hard'));assert.equal(queries,1);assert.equal(calls,3);
assert.equal(await recommend('easy'),null);assert.equal(calls,12);
assert.match(s,/if\(params.has\("recommend"\)\)\{const tier=rankTier/);console.log('PASS recommendation uses published rows, exact tier, bounded queries, cache coalescing and no fabricated fallback');
