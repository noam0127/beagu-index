import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
const source=readFileSync('scripts/beagu-2026-mbti-review-sync.gs','utf8');
const scope={console,Map,Set,Date,Number,Object,Array,String,Error,RegExp,Math};
runInNewContext(source,scope,{timeout:2000,filename:'school-mbti-staging.gs'});
const choices=[
  ['① A에 매우 가깝다',-2],['② A에 조금 가깝다',-1],
  ['③ 두 모습이 비슷하게 나타난다',0],['④ B에 조금 가깝다',1],
  ['⑤ B에 매우 가깝다',2],['⑥ 해당하지 않거나 판단하기 어렵다',null],
  ['',null]
];
for(const [answer,want] of choices)assert.equal(scope.mbti26_score(answer),want,'보기 채점 불일치 '+answer);
assert.throws(()=>scope.mbti26_score('미확인 선택지'),/검증되지 않은/);
assert.equal(scope.mbti26_region('① 강원'), '강원');
assert.equal(scope.mbti26_norm('유 천 초등학교'), '유천초등학교');
assert.equal(scope.mbti26_office('강원특별자치도강릉교육지원청'), '강릉');
assert.equal(scope.mbti26_office('전남광주통합특별시광주동부교육지원청'), '동부');
assert.equal(scope.mbti26_parseDay('2026. 10. 3'), '2026-10-03');
assert.equal(scope.mbti26_parseDay('2026. 11. 1. 오전 11:00'), '2026-11-01');
assert.equal(scope.mbti26_parseDay('2026. 11. 32'), null);
const h=Array.from({length:41},()=>''),headers={1:'B01. 학교가 있는 지역',2:'B02. 경기',21:'B03. 공식 명칭',37:'Q14. 관계',38:'Q15. 결정',39:'Q16. 변화',40:'Q17. 운영'};
for(const [i,label] of Object.entries(headers))h[Number(i)]=label;
const c=scope.mbti26_columns(h);
assert.equal(c.region,1);assert.equal(c.school,21);
assert.equal(c.offices[0],2);
assert.equal(JSON.stringify(c.q),'[37,38,39,40]');
assert.equal(scope.mbti26_classify([1,-1,-1,1])[0],'ENFP');
assert.equal(scope.mbti26_classify([-1,1,1,-1])[0],'ISTJ');
assert.equal(scope.mbti26_classify([.49,-1,-1,1])[2],'MIXED_OR_UNDETERMINED');
assert.equal(scope.mbti26_classify([1,1,1,1])[0],'ESTP');
assert.match(source,/2026-11-01/);
assert.match(source,/reviewSheet/);
assert.doesNotMatch(source,/service_role|SERVICE_ROLE_KEY/i);
assert.doesNotMatch(source,/\.from\(['"]beagu_release_metrics_v2/);
assert.doesNotMatch(source,/approval_status\s*=\s*['"]APPROVED/);
console.log('PASS: Google Forms Q14~Q17 6개 보기, 학교키 정규화, 16유형 대응, 일자 제외, 비공개 집계 정책');
