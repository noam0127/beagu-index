/* Run only in a private worker. No credentials or responses are logged or written to Git. */
import {readFile} from 'node:fs/promises';
import {createSign} from 'node:crypto';
import {prepareBatch} from './pipeline.mjs';
const sheet='1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4';
const base='https://snvzwrexuqavnfvzgxqj.supabase.co';
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key)throw Error('Private worker credentials required');
async function json(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`Provider HTTP ${r.status}`);return r.json();}
async function googleToken(){
 if(process.env.GOOGLE_ACCESS_TOKEN)return process.env.GOOGLE_ACCESS_TOKEN;
 if(!process.env.GOOGLE_SERVICE_ACCOUNT_JSON)throw Error('Google worker credential required');
 const account=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),now=Math.floor(Date.now()/1000);
 const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const unsigned=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:account.client_email,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const signature=createSign('RSA-SHA256').update(unsigned).sign(account.private_key,'base64url');
 const token=await json('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+signature})});
 if(!token.access_token)throw Error('Google token unavailable');return token.access_token;
}
const google=await googleToken();
const range=encodeURIComponent("'설문지 응답 시트1'!A:EJ");
const response=await json(`https://sheets.googleapis.com/v4/spreadsheets/${sheet}/values/${range}`,{headers:{Authorization:`Bearer ${google}`}});
const headers={apikey:key,Authorization:`Bearer ${key}`};
const schools=[];for(let offset=0;;offset+=1000){const page=await json(`${base}/rest/v1/schools?select=school_id,school_name,sido_standard,support_office,status&order=school_id&offset=${offset}&limit=1000`,{headers});schools.push(...page);if(page.length<1000)break;}
const book=JSON.parse(await readFile(new URL('./codebooks/2026.json',import.meta.url),'utf8'));
const batch=prepareBatch(response.values||[],schools,book,`https://docs.google.com/spreadsheets/d/${sheet}/edit`);
await json(`${base}/rest/v1/rpc/beagu_import_master_batch`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(batch)});
console.log('Private MASTER batch saved. Publication remains pending review.');
