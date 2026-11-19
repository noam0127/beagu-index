import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext, Script} from 'node:vm';

const read=path=>readFileSync(path,'utf8');
const paths=['search.html','search-lv1.html','statistics.html','challenge.html'];
const pages=Object.fromEntries(paths.map(path=>[path,read(path)]));
const css=read('styles/beagu-auth-journey-v1.css');
const levelJS=read('js/beagu-level-state-v1.js');
const compareJS=read('js/statistics-compare.js');
const gateJS=read('js/challenge-access-v1.js');
for(const p of ['js/beagu-level-state-v1.js','js/statistics-compare.js','js/challenge-access-v1.js'])
  assert.doesNotThrow(()=>new Script(read(p),{filename:p}),p+' parses');
for(const path of paths){
  assert.ok(pages[path].includes('styles/beagu-auth-journey-v1.css?v=20261120-compact-card1'),
    path+' uses the same auth card stylesheet');
  assert.ok(pages[path].includes('js/beagu-level-state-v1.js?v=20261120-auth-unity1'),
    path+' loads fresh level UI state');
}
for(const [path,id] of Object.entries({
  'search.html':'lv1QuickAuth',
  'search-lv1.html':'loginPanel',
  'statistics.html':'compareLv1AuthPanel',
  'challenge.html':'challengeAccessPanel'
})){
  assert.ok(pages[path].includes('id="'+id+'"'),path+' retains its authentication gate');
  assert.ok(pages[path].includes('beagu-levelup-card'),path+' uses the common panel');
}
assert.ok(pages['search-lv1.html'].includes('beagu-levelup-status') &&
 pages['search-lv1.html'].includes('data-beagu-open-levelup>고유번호 인증</button>'),
 'Authenticated search shows Level1 identity-code CTA and shared card');
assert.ok(pages['challenge.html'].includes('id="challengeAccessBadge"') &&
 pages['challenge.html'].includes('id="challengeLogout"') &&
 pages['challenge.html'].includes('id="challengeProtected" hidden'),
 'Challenge keeps one card above protected certificate with logout and badge');
assert.ok(!pages['challenge.html'].includes('data-beagu-open-levelup>레벨업 인증</button>'),
 'No second identity-code CTA below challenge certificate');
assert.ok(pages['challenge.html'].includes('id="identityCode"') &&
 pages['challenge.html'].includes('data-html2canvas-ignore="true"'),
 'Personal codes are excluded from screenshot capture');

for(const segment of ['#lv1QuickAuth','#loginPanel','#compareLv1AuthPanel',
 '#challengeAccessPanel','.beagu-levelup-status','min-height:220px',
 'min-height:54px','margin:auto 0 0','@media(max-width:720px)']){
 assert.ok(css.includes(segment),'Shared style includes '+segment);
}
assert.ok(css.includes('body.beagu-page-challenge main#main-content'),
 'Challenge mobile card has same outer alignment as search/comparison');
assert.ok(css.includes('clip-path:none'),'Auth card avoids torn-paper cropping');
const compactStart=css.indexOf('/* Compact authenticated upgrade cards:');
assert.ok(compactStart>=0,'Authenticated card has compact override');
const compact=css.slice(compactStart);
for(const selector of [
 'body.beagu-page-lv1 #searchPanel .beagu-levelup-status',
 'body.beagu-page-compare #compareLv1AuthPanel.is-authenticated'
]) assert.ok(compact.includes(selector),'Compact authenticated layout: '+selector);
assert.ok(compact.includes('min-height:0;')&&compact.includes('height:auto;'),
 'No artificial blank space above identity code CTA');
assert.ok(compact.includes('margin-bottom:12px;'),'Natural 12px space after header');
assert.ok(compact.includes('margin:0;'),'Identity verification CTA no longer pushed to bottom');
assert.ok(compact.includes('@media(max-width:720px)'),
 'Compact style applies on screenshot-sized mobile screens');
assert.ok(!compact.includes('body.beagu-page-search #lv1QuickAuth'),
 'Anonymous entry card should retain normal login form sizing');


const a=levelJS.indexOf('  const syncLevelCards=');
const b=levelJS.indexOf('  const setState=',a);
assert.ok(a>=0 && b>a,'Reusable auth card status updater exists');
const badges={};
const cards={};
const ids=[
 ['lv1QuickAuth','lv1QuickBadge'],
 ['loginPanel',null],
 ['compareLv1AuthPanel','compareLv1Badge'],
 ['challengeAccessPanel','challengeAccessBadge'],
 ['signed',null]
];
for(const [cardId,badgeId] of ids){
 const badge={textContent:'',classList:{toggle() {}}};
 const action={textContent:'',disabled:false,classList:{toggle() {}}};
 const card={dataset:{},querySelector(selector){
  return selector.includes('beagu-levelup-trigger')?action:badge;
 }};
 badges[cardId]=badge;
 cards[cardId]={card,badge,action};
 if(badgeId)badges[badgeId]=badge;
}
const document={
 getElementById(id){return cards[id]?.card || badges[id] || null;},
 querySelector(selector){return selector==='.beagu-levelup-status'?cards.signed.card:null;}
};
const sync=runInNewContext('(()=>{'+levelJS.slice(a,b)+'return syncLevelCards;})()', {document});
for(const [level,provisional,expectedBadge,expectedButton,disabled] of [
  ['checking',false,'확인 중','레벨업 인증',true],
  ['0',false,'미인증','레벨업 인증',false],
  ['1',false,'Lv.1 인증됨','고유번호 인증',false],
  ['2',true,'Lv.2(임시)','인증 완료',true],
  ['2',false,'Lv.2 인증됨','인증 완료',true]
]){
 sync(level,provisional);
 for(const [id,obj] of Object.entries(cards)){
  assert.equal(obj.badge.textContent,expectedBadge,id+' badge at level '+level);
  assert.equal(obj.action.textContent,expectedButton,id+' CTA at level '+level);
  assert.equal(obj.action.disabled,disabled,id+' button availability at level '+level);
  assert.equal(obj.card.dataset.provisional,String(provisional),id+' provisional state');
 }
}
assert.ok(levelJS.includes("result.provisional===true"),
 'Global level label reflects server verified provisional flag');
assert.ok(levelJS.includes("await refresh();") && levelJS.includes("window.location.reload();"),
 'Successful identity-code login refreshes and reloads protected views');
assert.ok(compareJS.includes('result.provisional===true')&&
 compareJS.includes("state.authProvisional=level>=2&&provisional===true"),
 'Comparison card uses the server provisional flag, not a UI-provided rank');
assert.ok(gateJS.includes('protectedArea.hidden=true') &&
 gateJS.includes('protectedArea.hidden=false') &&
 gateJS.includes('panel.hidden=false;'),
 'Challenge certificate remains protected but status card stays visible');
assert.ok(gateJS.includes('logoutButton.hidden=true') &&
 gateJS.includes('logoutButton.hidden=false'),
 'Logout visibility follows challenge verified session');
console.log('PASS: same card size and CTA layout; Lv0, Lv1, provisional Lv2, full Lv2 transitions');
