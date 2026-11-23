import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const pages=['index.html','search.html','search-lv1.html','statistics.html','challenge.html'];
for(const page of pages){
 const html=read(page);
 assert.match(html,/class="beagu-home-notice"/,page+' notice missing');
 assert.match(html,/2026 조사데이터 업로드 시작\./,page);
 assert.match(html,/레벨2부터 확인 가능합니다/,page);
 assert.match(html,/레벨이 높을수록 최신 자료와 더 많은 정보를 더 빠르게 확인할 수 있습니다/,page);
 if(page!=='index.html')assert.ok(html.indexOf('class="beagu-home-notice"')>html.indexOf('<main'),page+' is missing final notice');
}
for(const page of ['search.html','search-lv1.html','statistics.html'])
 assert.match(read(page),/styles\/beagu-global-notice-v1\.css/);
console.log('PASS: consistent bottom notice in five public page views');
