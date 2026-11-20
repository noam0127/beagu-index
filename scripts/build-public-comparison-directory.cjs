#!/usr/bin/env node
// Generate ONLY the public operating-school fields used by the comparison UI.
// Uses the existing PUBLIC Supabase publishable key (never a service-role key).
'use strict';
const fs=require('node:fs');
const config=fs.readFileSync('js/supabase-config.js','utf8');
const host=config.match(/const SUPABASE_URL = "(https:\/\/[^"]+)"/)?.[1];
const key=config.match(/const SUPABASE_PUBLISHABLE_KEY = "(sb_publishable_[^"]+)"/)?.[1];
if(!host||!key||!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(host))
  throw Error('Public Supabase configuration missing');
const FILE='data/public-comparison-school-directory-v1.json';
const ROW_FIELDS=['school_id','school_name','sido_standard','support_office','establishment'];
const PAGE_SIZE=1000;
function validate(list){
  if(!Array.isArray(list)||list.length<6000||list.length>12000)
    throw Error('Directory size outside validated operating-school bounds');
  const ids=new Set();
  for(const s of list){
    if(!Array.isArray(s)||s.length!==ROW_FIELDS.length||!/^[A-Z0-9]{7}$/.test(s[0])||
       typeof s[1]!=='string'||!s[1].trim()||ids.has(s[0]))
      throw Error('Invalid public school directory record');
    ids.add(s[0]);
  }
  list.sort((a,b)=>a[0].localeCompare(b[0],'en'));
}
async function run(){
  const rows=[];
  for(let offset=0;offset<20000;offset+=PAGE_SIZE){
    const url=new URL(host+'/rest/v1/schools');
    url.searchParams.set('select',ROW_FIELDS.join(','));
    url.searchParams.set('status','eq.운영');
    url.searchParams.set('order','school_id.asc');
    url.searchParams.set('limit',String(PAGE_SIZE));
    url.searchParams.set('offset',String(offset));
    const res=await fetch(url,{headers:{apikey:key,'Accept':'application/json'},
      signal:AbortSignal.timeout(25000)});
    if(!res.ok)throw Error('Public school export failed: '+res.status);
    const part=await res.json();
    if(!Array.isArray(part))throw Error('Unexpected school response');
    for(const school of part)rows.push(ROW_FIELDS.map(field=>school[field]??null));
    if(part.length<PAGE_SIZE)break;
  }
  validate(rows);
  let previous=null;
  try{previous=JSON.parse(fs.readFileSync(FILE,'utf8'));}catch(_){}
  if(previous&&previous.version===1&&JSON.stringify(previous.rows)===JSON.stringify(rows)){
    console.log('Public school directory unchanged: '+rows.length+' records');
    return;
  }
  const payload={version:1,source:'public.schools/status=운영',
    generated_at:new Date().toISOString(),count:rows.length,fields:ROW_FIELDS,rows};
  fs.writeFileSync(FILE,JSON.stringify(payload)+'\n','utf8');
  console.log('Exported '+rows.length+' approved public school records');
}
run().catch(err=>{console.error(err.message);process.exitCode=1});
