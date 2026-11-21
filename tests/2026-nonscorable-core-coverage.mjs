import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=path=>fs.readFileSync(path,'utf8');
const migration=read('supabase/migrations/20261122013000_beagu_2026_nonscorable_core_coverage.sql');
const source=read('scripts/beagu-2026-noon-sync.gs');
// A teacher may complete only the 13 core items, with optional items unanswered.
// "Cannot judge" is a VALID core answer but legitimately lacks a numeric score.
// A core blank is missing data, not an unrecognized answer or fraud evidence.
const scope={};
vm.createContext(scope);
vm.runInContext(source,scope,{timeout:2000});
assert.equal(scope.questionScore(1,'⑥ 판단하기 어렵다'),null);
assert.equal(scope.questionScore(1,''),null);
scope.questionColumns=()=>({school:2});
scope.getSubmittedDay=x=>String(x).slice(0,10);
scope.resolveSchool=()=>({school:{school_id:'7331195'},typeConflict:false});
scope.BEAGU26={sourceId:'official-private'};
const fixture=[
 ['제출시각','시도','학교','Q01. 예','Q14. 선택 응답'],
 ['2026-11-20','부산','가상학교','⑥ 판단하기 어렵다',''],
 ['2026-11-20','부산','가상학교','','']
];
const catalog={
 Q01:{kind:'choice',rows:[],columns:[],options:['전혀 그렇지 않다','그렇지 않다','보통이다','그렇다','매우 그렇다','판단하기 어렵다']},
 Q14:{kind:'choice',rows:[],columns:[],options:['A에 가깝다','B에 가깝다']}
};
const output=scope.beagu26BuildResults(fixture,[],catalog);
assert.equal(output.schools.length,1);
assert.equal(output.schools[0].school_response_rows,2);
const core=output.schools[0].questions[0];
const optional=output.schools[0].questions[1];
assert.equal(core.valid,1,'cannot judge is a recognized answer');
assert.equal(core.invalid,0,'cannot judge cannot be called invalid');
assert.equal(core.counts[5],1,'the answer remains counted as a response');
assert.equal(optional.valid,0,'optional blank is not fabricated');
assert.equal(optional.invalid,0,'optional blank is not malicious');
assert.equal(output.reviewRows.length,0,'valid non-scoring and blank answers need no review');
assert.match(migration,/q\.nonblank_response_rows>=0/);
assert.match(migration,/snapshot_core_rows<>13/);
assert.match(migration,/invalid_core_aggregate>0/);
assert.match(migration,/coalesce\(\(j\.q->>'valid'\)::integer,-1\)>=0/);
assert.match(migration,/coalesce\(\(j\.q->>'invalid'\)::integer,-1\)>=0/);
assert.match(migration,/coalesce\(\(j\.q->>'valid'\)::integer,-1\)\+coalesce\(\(j\.q->>'invalid'\)::integer,-1\)<=r\.school_response_rows/);
assert.doesNotMatch(migration,/insert into public\.beagu_2026_results_snapshot|update public\.beagu_2026_results_snapshot|grant execute .* to anon/i);
console.log('PASS: 13-item-only submission, cannot-judge and blank data remain valid; invalid item values still reviewed');
