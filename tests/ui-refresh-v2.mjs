import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const read = path => readFileSync(path,'utf8');
const pageTypes = new Map([
  ['index.html','home'],['search.html','search'],['search-lv1.html','lv1'],
  ['school-report.html','report'],['statistics.html','compare'],['challenge.html','challenge'],
  ['release-policy.html','policy'],['survey.html','survey'],
  ['teacher-volleyball.html','game'],['teacher-run.html','game']
]);
const css = read('styles/beagu-ui-refresh-v2.css');
const rules = [
  'body.beagu-page-home','body.beagu-page-search','body.beagu-page-lv1',
  'body.beagu-page-report','body.beagu-page-compare','body.beagu-page-challenge',
  'body.beagu-page-policy','body.beagu-page-survey'
];
for(const selector of rules) assert.ok(css.includes(selector), selector+' missing');
assert.match(css, /@media\(max-width:760px\)/,'tablet and phone responsive layout');
assert.match(css, /@media\(max-width:450px\)/,'small phone layout');
assert.match(css, /prefers-reduced-motion:reduce/,'respect reduced motion');
assert.match(css, /body\.beagu-page-report \.school-hero :is\(h2,.region,.address,.icon-fact\)\{color:#fff\}/,'dark hero text must contrast');
assert.match(css, /body\.beagu-page-compare \.comparison-picker \.compare-selection/,'five-school tiles must be responsive');
assert.match(css,/\.compare-heading-phrase[^{]*\{[^}]*white-space:nowrap/s,'Keep 나란히 비교 on one line');
assert.match(css,/--ui-accent:#078d9c/,'Shared accent color');
const phoneOverride = css.slice(css.lastIndexOf('/* Mobile homepage alignment:'));
assert.ok(phoneOverride.includes('@media (max-width:760px)'), 'mobile header overrides limited to small screens');
for(const [selector,rule] of [
  ['main.container>.logo','align-self:stretch'],
  ['main.container>.beagu-global-nav','justify-content:flex-start'],
  ['main.container>h1','align-self:stretch'],
  ['main.container>h1','text-align:left']
]){
  const ruleAt=phoneOverride.indexOf(selector);
  assert.ok(ruleAt>=0 && phoneOverride.slice(ruleAt,ruleAt+400).includes(rule),
    'homepage phone override missing '+selector+' / '+rule);
}


let depth=0, quote='', comment=false;
for(let i=0;i<css.length;i++){
  const c=css[i], n=css[i+1];
  if(comment){if(c==='*'&&n==='/'){comment=false;i++}continue}
  if(quote){if(c==='\\'){i++;continue}if(c===quote)quote='';continue}
  if(c==='/'&&n==='*'){comment=true;i++;continue}
  if(c==='"'||c==="'"){quote=c;continue}
  if(c==='{')depth++;
  if(c==='}'){depth--;assert.ok(depth>=0,'unmatched closing brace')}
}
assert.equal(depth,0,'CSS block braces balanced');
assert.equal(quote,'','CSS string closed');
assert.equal(comment,false,'CSS comment closed');

for(const [path,type] of pageTypes){
  const html=read(path);
  assert.match(html,new RegExp('class="[^"]*beagu-ui-page beagu-page-'+type+'[^"]*"'),path+' body class');
  const matches=[...html.matchAll(/<link[^>]+href="styles\/beagu-ui-refresh-v2\.css\?v=[a-zA-Z0-9-]+"/g)];
  assert.equal(matches.length,1,path+' exactly one refreshed theme');
  assert.ok(html.indexOf('styles/beagu-ui-refresh-v2.css')<html.indexOf('</head>'),path+' stylesheet in head');
  assert.ok(html.lastIndexOf('styles/beagu-ui-refresh-v2.css')>html.lastIndexOf('styles/beagu-loading-v1.css'),path+' theme loaded after old CSS');
  if(type!=='game'){
    assert.match(html,/BAEGU<span class="beagu-unified-name-accent">INDEX<\/span>/,path+' uppercase wordmark');
    assert.doesNotMatch(html,/<span class="beagu-brand-word">BAEGU INDEX<\/span>/,path+' outdated header');
  }
  if(!['game','compare'].includes(type)){
    assert.match(html,/class="beagu-skip-link" href="#main-content"/,path+' skip link');
    assert.match(html,/<main\b[^>]*id="main-content"/,path+' skip destination');
  }
  for(const match of html.matchAll(/<script(?![^>]*src)([^>]*)>([\s\S]*?)<\/script>/g)){
    if(/application\/(?:json|ld\+json)/.test(match[1]))continue;
    if(match[2].trim())assert.doesNotThrow(()=>new Script(match[2],{filename:path}),path+' inline syntax');
  }
}
for(const page of ['index.html','search.html','search-lv1.html','school-report.html','statistics.html','challenge.html']){
  assert.match(read(page),/beagu-unified-nav/,'main menu preserved: '+page);
}
const home=read('index.html');
assert.match(home,/data-cumulative="responses"/,'live survey response counters preserved');
assert.match(home,/data-cumulative="schools"/,'live participation school counters preserved');
assert.match(home,/id="teacher-game-frame"/,'volleyball game preserved');
assert.match(home,/id="teacher-run-frame"/,'teacher-run game preserved');
assert.match(read('search.html'),/id="searchInput"/,'public search preserved');
assert.match(read('search-lv1.html'),/id="loginForm"/,'authenticated school search preserved');
assert.match(read('school-report.html'),/id="yearGrid"/,'year comparison preserved');
assert.match(read('statistics.html'),/compare-table/,'five school comparison preserved');
assert.doesNotMatch(read('survey.html'),/submit_survey/,'public test RPC must stay disabled');
console.log('PASS: all 10 pages themed, mobile/layout, contrast, navigation, core controls, syntax');
