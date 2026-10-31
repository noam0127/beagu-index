import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const html=fs.readFileSync('school-report.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.ok(scripts.length>=2,'Expected catalog and application scripts');
const src=scripts.at(-1)[1];
const temp=join(tmpdir(),'beagu-school-report-syntax-'+process.pid+'.mjs');
fs.writeFileSync(temp,src);
try{
  const check=spawnSync(process.execPath,['--check',temp],{encoding:'utf8'});
  assert.equal(check.status,0,check.stderr||check.stdout);
}finally{fs.unlinkSync(temp)}
for(const item of ['id="tierSelector"','id="tierCodeForm"','id="approvedSummary"','function publicYearDB','function questionCatalogDB','function protectedReport','function loginTier','tier-locked','Lv.2']){
  assert.ok(html.includes(item),'Missing report control: '+item);
}
assert.ok(html.includes('beagu-level-api'),'Protected report must use server-side token validation');
assert.ok(!src.includes('SUPABASE_SERVICE_ROLE_KEY'),'Do not expose service role key');
console.log('School report JS syntax, UI bindings and public/private separation: PASS');
