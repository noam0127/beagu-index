(()=>{"use strict";
const $=id=>document.getElementById(id);
const endpoint="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-account-v1",key="beagu-level-session-v1",own="beagu-account-session-v1";
const accountCode=/^[A-Za-z0-9-]{8,120}$/,recoveryCode=/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{13}$/,secret=/^[a-f0-9]{64}$/;
let busy=false,card=null;const msg=s=>$("accountMessage").textContent=s;
const device=()=>{try{return localStorage.getItem("beagu-referral-device-secret-v1")||""}catch{return ""}};
const session=()=>sessionStorage.getItem(own)||"";
const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newRecovery=()=>Array.from(crypto.getRandomValues(new Uint8Array(13)),b=>alphabet[b&31]).join("");
const grouped=s=>s.slice(0,4)+"-"+s.slice(4,8)+"-"+s.slice(8);
const badge=(el,active,known=true)=>{el.textContent=known?(active?"Lv.2 활성":"Lv.2 비활성"):"Lv.2 확인 필요";el.dataset.active=known&&active?"true":"false";};
async function api(action,fields={}){
 const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","X-Beagu-Session":session()},cache:"no-store",body:JSON.stringify({action,...fields})});
 const result=await res.json();if(!res.ok){const error=Error("인증 또는 계정 확인에 실패했습니다. 입력값을 확인하세요.");error.rejected=res.status>=400&&res.status<500;throw error;}return result;
}
async function exclusive(fn){if(busy)return;busy=true;const controls=[...document.querySelectorAll("button")];controls.forEach(b=>b.disabled=true);try{await fn()}catch(e){msg(e.message||"처리 실패")}finally{busy=false;controls.forEach(b=>b.disabled=false);}}
function clearCard(){card=null;$("issuedAccount").hidden=true;$("cardAccount").textContent="";$("cardRecovery").textContent="";$("cardLv2").textContent="";$("cardNotice").textContent="";}
function showCard(id,recovery,r){card={id,recovery,active:r?.lv2_active===true,known:Boolean(r)};$("issuedAccount").hidden=false;$("cardAccount").textContent=id;badge($("cardLv2"),card.active,card.known);$("cardRecovery").textContent=grouped(recovery);$("cardNotice").textContent=r?"발급 완료 · 지금 저장하세요.":"처리 결과를 확인하지 못했습니다. 이 회원증을 보관하고 새 비밀번호로 로그인하여 확인하세요.";}
function clearSession(){const t=session();if(t&&sessionStorage.getItem(key)===t)sessionStorage.removeItem(key);sessionStorage.removeItem(own);$("accountSummary").hidden=true;$("currentAccount").textContent="";$("currentLv2").textContent="";$("accountNickname").hidden=true;$("accountNickname").textContent="";}
function renderOwner(r){if(!accountCode.test(r.account_id||"")||![1,2].includes(r.level))throw Error("인증 실패");$("accountSummary").hidden=false;$("currentAccount").textContent=r.account_id;badge($("currentLv2"),r.lv2_active===true&&r.level===2);const n=$("accountNickname");n.hidden=!/^[Il|ǀ❘ı∣│]{10}$/.test(r.nickname||"");n.textContent=n.hidden?"":"이번 주 바코드 닉네임: "+r.nickname;$("accountLogin").elements.account_id.value=r.account_id;$("accountRecover").elements.account_id.value=r.account_id;msg(r.level===2?"로그인 완료 · Lv.2 활성":"로그인 완료 · Lv.1 · Lv.2 비활성");}
function install(r){if(!secret.test(r.token||"")||!accountCode.test(r.account_id||"")||![1,2].includes(r.level))throw Error("인증 실패");sessionStorage.setItem(own,r.token);sessionStorage.setItem(key,r.token);renderOwner(r);}
$("accountSignup").onsubmit=e=>{e.preventDefault();const f=e.currentTarget;const data=new FormData(f);const password=data.get("password"),confirmation=data.get("password_confirm");f.elements.password.value="";f.elements.password_confirm.value="";void exclusive(async()=>{
 if(typeof password!=="string"||Array.from(password).length<4){msg("비밀번호를 4자 이상 입력하세요.");return;}
 if(password!==confirmation){msg("비밀번호가 일치하지 않습니다.");return;}
 const id=String(data.get("code")).trim(),recovery=newRecovery();clearCard();
 try{const r=await api("signup",{account_id:id,new_recovery:recovery,code:String(data.get("code")).trim(),password,deviceSecret:device()});if(r.account_id!==id||![1,2].includes(r.level))throw Error("가입 결과 확인 실패");showCard(id,recovery,r);$("accountLogin").elements.account_id.value=id;msg("가입 완료. 회원증을 저장한 뒤 로그인하세요.");}
 catch(e){if(!e.rejected){showCard(id,recovery,null);$("accountLogin").elements.account_id.value=id;}throw e;}
});};
$("accountLogin").onsubmit=e=>{e.preventDefault();const f=e.currentTarget;const data=new FormData(f);const password=data.get("password");f.elements.password.value="";void exclusive(async()=>install(await api("password_login",{account_id:String(data.get("account_id")).trim(),password})));};
$("accountRecover").onsubmit=e=>{e.preventDefault();const f=e.currentTarget,data=new FormData(f);const password=data.get("password"),old=String(data.get("recovery")).replace(/[-\s]/g,"").toUpperCase(),id=String(data.get("account_id")).trim();f.elements.password.value="";f.elements.recovery.value="";void exclusive(async()=>{
 if(!accountCode.test(id)||!recoveryCode.test(old))throw Error("고유번호와 복구코드를 확인하세요.");
 const recovery=newRecovery();clearCard();
 try{const r=await api("recover",{account_id:id,recovery:old,new_recovery:recovery,password});if(r.account_id!==id||![1,2].includes(r.level))throw Error("복구 결과 확인 실패");clearSession();showCard(id,recovery,r);$("accountLogin").elements.account_id.value=id;msg("비밀번호 변경 완료. 기존 복구코드는 사용할 수 없습니다. 새 회원증을 저장하세요.");}
 catch(e){if(!e.rejected){clearSession();showCard(id,recovery,null);$("accountLogin").elements.account_id.value=id;}throw e;}
});};
$("accountSaveCard").onclick=()=>{if(!card)return;const file=new Blob(["BAEGUINDEX 익명 회원증\n로그인 고유번호: "+card.id+"\n"+(card.known?(card.active?"Lv.2 활성":"Lv.2 비활성"):"Lv.2 확인 필요")+" (발급 시점)\n일회용 복구코드: "+grouped(card.recovery)+"\n타인과 공유 금지. 복구 후 새 회원증을 저장하세요.\n"],{type:"text/plain;charset=utf-8"});const url=URL.createObjectURL(file),a=document.createElement("a");a.href=url;a.download="BAEGUINDEX-익명회원증.txt";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$("accountHideCard").onclick=clearCard;
$("accountLogout").onclick=()=>void exclusive(async()=>{try{if(session())await api("logout");}finally{clearSession();clearCard();}msg("로그아웃 완료");});
async function refresh(){if(!session())return;try{renderOwner(await api("status"));}catch(e){clearSession();msg("세션이 만료되었습니다. 다시 로그인하세요.");}}
if(session())void exclusive(refresh);
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&session())void exclusive(refresh);});
})();