const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('supabase/functions/beagu-referral-link-v1/index.ts','utf8');
const creditBody=source.match(/function verifiedReferralCredit\([^\n]+\) \{\n([\s\S]*?)\n\}/);
assert.ok(creditBody,'missing production credit helper');
const credit=new Function('profile',creditBody[1]);
for(const profile of [null,{}, {level:2,validReferrals:0},{level:2,validReferrals:'1'},{level:2,validReferrals:true},{level:2,validReferrals:1.2},{level:2,validReferrals:-1},{level:2,validReferrals:Infinity},{level:1,validReferrals:1},{level:'2',validReferrals:1}])assert.equal(credit(profile).earned,false,JSON.stringify(profile));
assert.deepEqual(credit({level:2,validReferrals:1}),{count:1,earned:true});
assert.deepEqual(credit({level:2,validReferrals:25}),{count:25,earned:true});
const start=source.indexOf('    const credit = verifiedReferralCredit(enrollment);');
const stop=source.indexOf('    const { data: shortCode',start);
assert.ok(start>=0&&stop>start);
const promote=new Function('verifiedReferralCredit','enrollment','session','db','digest','sessionToken','visitor','json','origin',
'return (async()=>{'+source.slice(start,stop)+';return {ok:true};})()');
const visitor='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
async function check(session,enrollment,result){
 const calls=[];
 const q={};
 for(const method of ['update','eq','lte','gt','is','select'])q[method]=(...args)=>{calls.push([method,...args]);return q};
 q.maybeSingle=async()=>result;
 const out=await promote(credit,enrollment,session,{from:(table)=>{calls.push(['from',table]);return q}},async()=> 'hash','token',visitor,(_o,status,data)=>({status,data}),'');
 return {out,calls};
}
(async()=>{
 const valid={level:2,validReferrals:1};
 const unbound={access_level:1,identity_visitor_id:null};
 const row={data:{access_level:2,identity_visitor_id:visitor},error:null};
 let x=await check(unbound,valid,row);
 assert.equal(x.out.ok,true);
 assert.ok(x.calls.some(c=>c[0]==='eq'&&c[1]==='access_level'&&c[2]===1));
 assert.ok(x.calls.some(c=>c[0]==='is'&&c[1]==='identity_visitor_id'&&c[2]===null));
 assert.ok(x.calls.some(c=>c[0]==='gt'&&c[1]==='expires_at'));
 x=await check({access_level:1,identity_visitor_id:visitor},valid,row);
 assert.ok(x.calls.some(c=>c[0]==='eq'&&c[1]==='identity_visitor_id'&&c[2]===visitor));
 for(const failure of [{data:null,error:null},{data:null,error:{code:'test'}},{data:{access_level:2,identity_visitor_id:'other'},error:null}]){
 x=await check(unbound,valid,failure);assert.equal(x.out.status,503);assert.equal(x.out.data.error,'SESSION_UPGRADE_UNAVAILABLE');
 }
 x=await check(unbound,{level:2,validReferrals:0},row);assert.equal(x.calls.length,0);
 x=await check({access_level:2,identity_visitor_id:visitor},valid,row);assert.equal(x.calls.length,0);
 assert.match(source,/credit\.earned && Number\(session\.access_level\) === 2 &&\s*session\.identity_visitor_id === visitor/);
 console.log('PASS referral promotion: strict credit, stale/expired/rebound session denial, verified recovery and idempotent retry');
})().catch(e=>{console.error(e);process.exitCode=1});
