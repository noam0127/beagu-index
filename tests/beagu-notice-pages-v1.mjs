import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const pages=['index.html','search.html','search-lv1.html','statistics.html','challenge.html'];
for(const page of pages){
 const html=read(page);
 assert.match(html,/class="beagu-home-notice"/,page+' notice missing');
 assert.match(html,/2026년 배구지수 데이터 작업 중입니다/,page);
 assert.match(html,/Lv\.3 및 회원가입 기능, 포스트잇 기능 점검 중/,page);
 if(page!=='index.html')assert.ok(html.indexOf('class="beagu-home-notice"')>html.indexOf('<main'),page+' is missing final notice');
}
for(const page of ['search.html','search-lv1.html','statistics.html'])
 assert.match(read(page),/styles\/beagu-global-notice-v1\.css/);
console.log('PASS: consistent bottom notice in five public page views');
