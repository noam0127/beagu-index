import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const paths=['search.html','search-lv1.html','statistics.html','challenge.html'];
const level=read('js/beagu-level-state-v1.js');
const unified=read('js/beagu-participation-auth-v2.js');
const css=read('styles/beagu-participation-auth-v2.css');
for(const path of paths){
 const page=read(path);
 for(const asset of ['js/beagu-level-state-v1.js','js/beagu-participation-auth-v2.js','styles/beagu-participation-auth-v2.css'])
  assert.ok(page.includes(asset),path+' loads '+asset);
}
for(const [path,id] of Object.entries({
 'search.html':'lv1QuickAuth','search-lv1.html':'loginPanel',
 'statistics.html':'compareLv1AuthPanel','challenge.html':'challengeAccessPanel'
}))assert.ok(read(path).includes('id="'+id+'"'),path+' retains protected gate DOM');
for(const path of ['js/beagu-level-state-v1.js','js/beagu-participation-auth-v2.js',
  'js/statistics-compare.js','js/challenge-access-v1.js'])
 assert.doesNotThrow(()=>new Script(read(path),{filename:path}));
for(const s of [
 '참여코드 입력',
 '참여코드를 입력하세요','레벨1 인증',
 '✓ Lv1 · 설문 참여 완료','♛ Lv2 · 챌린지 달성',
 'Lv.1 참여코드 받기','Lv.2 참여코드 받기'
])assert.ok(unified.includes(s),'Shared UI copy: '+s);
assert.ok(unified.includes("request('login',{code:value})"),'Login is verified server-side');
assert.ok(unified.includes("request('verify',{},result.token)"),'Login session independently verified');
assert.ok(unified.includes("sessionStorage.setItem(KEY,result.token)"),'Existing session key unchanged');
assert.ok(unified.includes("request('logout',{},token)"),'Session revocation supported');
assert.ok(unified.includes("e.preventDefault();open()"),'Click level badge opens shared modal');
assert.ok(css.includes('@media(max-width:760px)')&&css.includes('.beagu-participation-overlay'),'Responsive modal');
assert.ok(css.includes('display:none!important'),'Legacy inline forms hidden, not silently called');
assert.ok(css.includes('#tierCodeForm.beagu-participation-legacy'),
 'School report legacy auth form remains hidden when shared verification dialog is present');
assert.ok(read('school-report.html').includes('id="tierSubmit" type="submit">레벨1 인증</button>'),
 'School report fallback submit matches Level1 label');
assert.ok(!unified.includes('고유번호 인증') && !unified.includes('beaguLevelUpOverlay'),
 'Global shared UI does not resurrect removed identity-code auth button');

const begin=level.indexOf('  const syncLevelCards='),end=level.indexOf('  const setState=',begin);
assert.ok(begin>=0&&end>begin);
const cards={};
for(const id of ['lv1QuickAuth','loginPanel','compareLv1AuthPanel','challengeAccessPanel','signed']){
 const badge={textContent:'',classList:{toggle(){}}};
 const card={dataset:{},querySelector(){return badge;}};
 cards[id]={card,badge};
}
const badges={lv1QuickBadge:'lv1QuickAuth',compareLv1Badge:'compareLv1AuthPanel',challengeAccessBadge:'challengeAccessPanel'};
const document={
 getElementById(id){return cards[id]?.card||cards[badges[id]]?.badge||null},
 querySelector(selector){return selector==='.beagu-levelup-status'?cards.signed.card:null}
};
const sync=runInNewContext('(()=>{'+level.slice(begin,end)+'return syncLevelCards})()', {document});
for(const [rank,provisional,label] of [
 ['0',false,'미인증'],['1',false,'✓ Lv1 · 설문 참여 완료'],
 ['2',true,'♛ Lv2 · 챌린지 달성'],['2',false,'♛ Lv2 · 챌린지 달성']
]){
 sync(rank,provisional);
 for(const obj of Object.values(cards)){
  assert.equal(obj.badge.textContent,label);
  assert.equal(obj.card.dataset.provisional,String(provisional));
 }
}
assert.match(read('js/challenge-access-v1.js'),/beagu:participation-authenticated/);
assert.match(read('js/statistics-compare.js'),/beagu:participation-authenticated/);
assert.match(read('js/level-search.js'),/beagu:participation-authenticated/);
console.log('PASS: unified auth modal, status cards, signed gates, server verify and responsive states.');
