#!/usr/bin/env node
/* Nightly export of the publicly readable operating school directory.
 * Only display fields. Never use service-role keys, survey rows or private schemas.
 * Node 22+; reads the same publishable key already shipped to the browser.
 */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const cfg=fs.readFileSync(path.resolve(__dirname,'../js/supabase-config.js'),'utf8');
function configValue(name){
  const match=cfg.match(new RegExp('const '+name+'\\s*=\\s*["\\\']([^"\\\']+)["\\\']'));
  if(!match)throw new Error('Missing public config: '+name);
  return match[1];
}
const base=configValue('SUPABASE_URL').replace(/\/$/,'');
const key=configValue('SUPABASE_PUBLISHABLE_KEY');
const PAGE=1000;
const fields=['school_id','school_name','sido_standard','support_office','establishment'];
async function page(offset){
  const url=new URL(base+'/rest/v1/schools');
  url.searchParams.set('select',fields.join(','));
  url.searchParams.set('status','eq.운영');
  url.searchParams.set('order','school_id.asc');
  url.searchParams.set('limit',String(PAGE));
  url.searchParams.set('offset',String(offset));
  const result=await fetch(url,{headers:{apikey:key,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
  if(!result.ok)throw new Error('Public school directory fetch '+offset+' failed: '+result.status);
  const rows=await result.json();
  if(!Array.isArray(rows)||rows.length>PAGE)throw new Error('Unexpected response shape');
  return rows;
}
async function main(){
  const entries=[];
  for(let offset=0;offset<20000;offset+=PAGE){
    const batch=await page(offset);
    entries.push(...batch);
    if(batch.length<PAGE)break;
  }
  if(entries.length<6000||entries.length>15000)throw new Error('Unsafe school count '+entries.length);
  const ids=new Set();
  const rows=entries.map(s=>{
    const id=String(s.school_id||''),name=String(s.school_name||'');
    if(!/^[A-Z0-9]{7}$/.test(id)||!name.trim()||ids.has(id))
      throw new Error('Invalid/duplicate school identity');
    ids.add(id);
    return fields.map(field=>s[field]??null);
  });
  const payload={
    schema_version:2,source:'public.schools',generated_at:new Date().toISOString(),
    count:rows.length,rows
  };
  const destination=path.resolve(__dirname,'../data/public-compare-school-directory-v1.json');
  fs.writeFileSync(destination,JSON.stringify(payload)+'\n');
  process.stdout.write('Validated '+rows.length+' public operating schools.\n');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
