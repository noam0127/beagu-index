// Vercel independent staging mirror; never run on the production project.
import fs from 'node:fs';
import path from 'node:path';
const BASE = '36c68c8394a77a94541a2ad04a83db7242639c0c';
const PROD_REF = 'snvzwrexuqavnfvzgxqj';
const STAGE_REF = 'ycwuugggqbunlbwuzvbx';
const TEST_ORIGIN = 'https://baegu-index-test.vercel.app';
const PUB = "sb_publishable_c8h7TaIYONfP56Zc05K0Sw_SxyT3lZU";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljd3V1Z2dncWJ1bmxid3V6dmJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwODMxNjUsImV4cCI6MjExMDY1OTE2NX0.uwpQDeY-nJcdq99IYTOuqATRNYwHYnropFUKDCHD-WM";
const OUT = 'dist';
if (process.env.VERCEL_PROJECT_PRODUCTION_URL && process.env.VERCEL_PROJECT_PRODUCTION_URL !== 'baegu-index-test.vercel.app') throw Error('Wrong deployment target');
const cfg = fs.readFileSync('js/supabase-config.js','utf8');
const originalKey = cfg.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0];
if (!originalKey || !cfg.includes(PROD_REF)) throw Error('Unexpected production config');
fs.rmSync(OUT,{recursive:true,force:true});
fs.mkdirSync(OUT,{recursive:true});
let copied=0, changed=0, html=0;
function copy(src) {
  const stat=fs.lstatSync(src);
  if (stat.isSymbolicLink()) throw Error('Symlink rejected: '+src);
  if (stat.isDirectory()) {
    for (const f of fs.readdirSync(src)) if(!f.startsWith('.')) copy(path.join(src,f));
    return;
  }
  const dst=path.join(OUT,src);
  fs.mkdirSync(path.dirname(dst),{recursive:true});
  if (!/\.(html|js|mjs|css|json|csv|txt|svg)$/i.test(src)) {
    fs.copyFileSync(src,dst); copied++; return;
  }
  const old=fs.readFileSync(src,'utf8');
  let s=old;
  // Substitute only the published client credential. Reject other production tokens.
  s=s.replaceAll(originalKey,PUB);
  s=s.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, token=>{
    let claims; try {claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString())} catch {return token;}
    if(claims.ref!==PROD_REF) return token;
    if(claims.role!=='anon') throw Error('Non-public credential in '+src);
    return ANON;
  });
  s=s.replaceAll(PROD_REF,STAGE_REF).replaceAll('https://www.baeguindex.com',TEST_ORIGIN).replaceAll('https://baeguindex.com',TEST_ORIGIN);
  // Do not send test survey responses to the live Google Form.
  s=s.replace(/https:\/\/(?:forms\.gle\/|docs\.google\.com\/forms\/)[^\s"'<>\\\x60)]+/g,TEST_ORIGIN+'/test-survey-disabled.html');
  if(s.includes(PROD_REF)||s.includes(originalKey)) throw Error('Production config residue: '+src);
  if (src.endsWith('.html')) {
    html++;
    s=s.replace(/<head(?:\s[^>]*)?>/i,m=>m+'<meta name="robots" content="noindex,nofollow">');
  }
  if(s!==old)changed++;
  fs.writeFileSync(dst,s);
  copied++;
}
for (const f of fs.readdirSync('.')) if(/^[^/]+\.html$/.test(f)) copy(f);
for (const d of ['assets','data','js','styles','r','css','\u200bcss']) if(fs.existsSync(d)) copy(d);
// Public root resources used by the browser; never copy server scripts, SQL, or repository metadata.
for (const f of ['lv2-edited-column-schema.json','release-candidate.json']) if(fs.existsSync(f)) copy(f);
fs.writeFileSync(path.join(OUT,'robots.txt'),'User-agent: *\nDisallow: /\n');
fs.writeFileSync(path.join(OUT,'test-survey-disabled.html'),'<!doctype html><html lang="ko"><meta charset="utf-8"><title>시험 설문</title><h1>시험 환경에서는 실제 설문 제출이 차단됩니다.</h1><a href="/">홈으로</a></html>');
fs.writeFileSync(path.join(OUT,'test-mirror-version.json'),JSON.stringify({productionBaseline:BASE,mode:'isolated-test',html,copied,changed,stageRef:STAGE_REF},null,2));
for(const f of ['index.html','search.html','search-lv1.html','search-lv2.html','statistics.html','challenge.html','admin.html','admin-updates.html','teacher-volleyball.html','teacher-run.html','js/supabase-config.js']) if(!fs.existsSync(path.join(OUT,f)))throw Error('Missing mirror file: '+f);
const c=fs.readFileSync(path.join(OUT,'js/supabase-config.js'),'utf8');
if(!c.includes(STAGE_REF)||!c.includes(PUB)||c.includes(PROD_REF))throw Error('Isolation check failed');
console.log('Staging mirror:',JSON.stringify({base:BASE,html,copied,changed}));
