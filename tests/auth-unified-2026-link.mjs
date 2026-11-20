import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const link='https://forms.gle/TPyCakK6Sj2zchRy7';
const pages=[
  ['search.html','lv1QuickForm','lv1QuickCode','lv1QuickToggle','lv1QuickSubmit','lv1QuickBadge'],
  ['search-lv1.html','loginForm','levelCode','toggleCode','loginButton',null],
  ['statistics.html','compareLv1Form','compareLv1Code','compareLv1Toggle','compareLv1Submit','compareLv1Badge']
];
for(const [path,form,input,toggle,submit,badge] of pages){
  const html=read(path);
  assert.ok(html.includes('href="styles/beagu-auth-unified-v1.css?v=20261119-auth1"'),path+' shared stylesheet');
  for(const className of ['beagu-auth-card','beagu-auth-heading','beagu-auth-badge','beagu-auth-form','beagu-auth-help'])
    assert.ok(html.includes(className),path+' missing '+className);
  assert.match(html,/참여코드 입력/,path+' title');
  assert.match(html,/>참여코드<\/label>/,path+' label');
  assert.ok(html.includes('placeholder="발급받은 참여코드를 입력하세요"'),path+' placeholder');
  assert.match(html,/>참여코드 입력<\/button>/,path+' submit label');
  assert.ok(html.includes('aria-label="참여코드 표시"'),path+' visibility control');
  assert.ok(html.includes('참여코드는 <a'),path+' help start');
  assert.ok(html.includes('>2026 조사 참여</a> 시 발급됩니다.'),path+' help copy');
  assert.ok(html.includes('href="'+link+'"'),path+' official survey link');
  for(const id of [form,input,toggle,submit,...(badge?[badge]:[])])
    assert.ok(html.includes('id="'+id+'"'),path+' missing preserved control '+id);
  assert.ok(html.indexOf('beagu-auth-unified-v1.css')<html.indexOf('</head>'),path+' CSS link before close of head');
}
const css=read('styles/beagu-auth-unified-v1.css');
assert.ok(css.includes('.beagu-auth-card .beagu-auth-form'));
assert.ok(css.includes('.beagu-auth-card .beagu-auth-submit'));
assert.ok(css.includes('@media(max-width:420px)'));
assert.ok(css.includes('@media(max-width:720px)'));
const search=read('search.html');
assert.ok(search.includes("action==='login'?{action,code}"),'quick auth still goes to the server');
assert.ok(search.includes("sessionStorage.setItem(key,data.token)"),'quick auth stores verified session only');
const lv1=read('js/level-search.js');
assert.ok(lv1.includes("$('loginForm').addEventListener('submit'"),'Lv.1 verification preserved');
const compare=read('js/statistics-compare.js');
assert.ok(compare.includes("authRequest('login',{code})"),'comparison verification preserved');
assert.ok(read('index.html').includes(link),'same survey link already on homepage');
console.log('PASS: three harmonized verification cards, official 2026 form link and preserved authentication IDs');
