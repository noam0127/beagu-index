const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const read=p=>fs.readFileSync(p,"utf8"),src=read("js/beagu-account-v1.js"),html=read("account.html");
for(const id of ["accountSignup","accountLogin","accountRecover","accountSaveCard","accountHideCard","accountLogout","currentLv2","cardLv2","cardRecovery"])assert.ok(html.includes('id="'+id+'"'));
assert.doesNotMatch(html,/type="email"|type="tel"|accountGoogle|accountFormal/);
assert.match(read("index.html"),/href="account\.html"/);
assert.match(read("js/beagu-participation-auth-v2.js"),/href="account\.html"/);
assert.match(read("supabase/functions/beagu-level-api/index.ts"),/beagu_account_level_session_allowed_v1/);
const map=new Map(),store=new Map(),local=new Map([["beagu-referral-device-secret-v1","a".repeat(64)]]);
const node=id=>{if(!map.has(id))map.set(id,{hidden:false,textContent:"",dataset:{},elements:{password:{value:"test"},password_confirm:{value:"test"},recovery:{value:"test"},account_id:{value:""}},disabled:false});return map.get(id)};
const storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)});
const calls=[],account="SYNTHETIC-CODE",nickname="Il|ǀ❘ı∣│Il",token="b".repeat(64),nextToken="c".repeat(64);
let recovery,active=false,logged=false,n=0,fileText;
const context={document:{getElementById:node,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({click(){}})},window:{},sessionStorage:storage(store),localStorage:storage(local),crypto:{getRandomValues:a=>a.fill(++n)},Blob:class{constructor(parts){fileText=parts.join("")}},URL:{createObjectURL:()=>"blob:fixture",revokeObjectURL(){}},setTimeout:()=>{},FormData:class{constructor(f){this.data=f.data}get(k){return this.data[k]}},fetch:async(_url,opts)=>{
 const b=JSON.parse(opts.body);calls.push({body:b,headers:opts.headers});assert.ok(!("Authorization" in opts.headers));
 let data;
 if(b.action==="signup"){assert.equal(b.account_id,account);assert.equal(b.code,account);assert.match(b.new_recovery,/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{13}$/);recovery=b.new_recovery;data={account_id:account,level:1,lv2_active:false};}
 else if(b.action==="password_login"){logged=true;data={account_id:account,nickname,token:active?nextToken:token,level:active?2:1,lv2_active:active};}
 else if(b.action==="recover"){assert.equal(b.recovery,recovery);assert.notEqual(b.new_recovery,recovery);recovery=b.new_recovery;active=true;data={account_id:account,level:2,lv2_active:true};}
 else if(b.action==="logout"){assert.equal(opts.headers["X-Beagu-Session"],nextToken);data={ok:true};}
 else throw Error("unexpected call "+b.action);
 return {ok:true,json:async()=>data};
}};
const settle=()=>new Promise(r=>setImmediate(r));
const submit=async(id,data)=>{const f=node(id);f.data=data;f.onsubmit({preventDefault(){},currentTarget:f});await settle();await settle();};
(async()=>{
 vm.runInNewContext(src,context);
 await submit("accountSignup",{code:"SYNTHETIC-CODE",password:"x7!Q",password_confirm:"mismatch"});
 assert.equal(calls.length,0);assert.match(node("accountMessage").textContent,/일치하지/);
 await submit("accountSignup",{code:"SYNTHETIC-CODE",password:"abc",password_confirm:"abc"});
 assert.equal(calls.length,0);assert.match(node("accountMessage").textContent,/4자 이상/);
 await submit("accountSignup",{code:"SYNTHETIC-CODE",password:"x7!Q",password_confirm:"x7!Q"});
 assert.equal(node("accountSignup").elements.password_confirm.value,"");assert.equal("password_confirm" in calls[0].body,false);
 assert.equal(node("accountLogin").elements.account_id.value,account);
 assert.equal(node("accountSignup").elements.password.value,"");
 assert.equal(node("cardLv2").textContent,"Lv.2 비활성");assert.equal(store.get("beagu-account-session-v1"),token);
 assert.equal(node("cardRecovery").textContent.replaceAll("-",""),recovery);
 node("accountSaveCard").onclick();assert.ok(fileText.includes(account)&&fileText.includes("Lv.2 비활성")&&fileText.includes(node("cardRecovery").textContent));
 node("accountHideCard").onclick();assert.equal(node("cardRecovery").textContent,"");
 await submit("accountLogin",{account_id:account,password:"x7!Q"});
 assert.equal(store.get("beagu-level-session-v1"),token);
 assert.ok(node("accountNickname").textContent.includes(nickname));assert.equal(node("currentLv2").textContent,"Lv.2 비활성");
 await submit("accountRecover",{account_id:account,recovery,password:"replacement-password"});
 assert.equal(node("accountRecover").elements.password.value,"");assert.equal(node("accountRecover").elements.recovery.value,"");assert.equal(store.has("beagu-account-session-v1"),false);
 assert.equal(node("cardLv2").textContent,"Lv.2 활성");assert.equal(node("cardRecovery").textContent.replaceAll("-",""),recovery);
 await submit("accountLogin",{account_id:account,password:"replacement-password"});
 assert.equal(node("currentLv2").textContent,"Lv.2 활성");
 node("accountLogout").onclick();await settle();await settle();
 assert.equal(store.has("beagu-level-session-v1"),false);assert.equal(store.has("beagu-account-session-v1"),false);
 assert.equal(node("accountNickname").hidden,true);assert.equal(node("cardRecovery").textContent,"");
 assert.equal(calls[0].body.deviceSecret,"a".repeat(64));assert.ok([...store.values(),...local.values()].every(x=>x!==recovery));
 console.log("PASS anonymous account UI: signup, local member card, Lv2 activation, recovery rotation, secret clearing and logout");
})().catch(e=>{console.error(e);process.exitCode=1});
