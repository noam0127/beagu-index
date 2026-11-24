(()=>{"use strict";
const $=id=>document.getElementById(id),client=typeof supabaseClient!=="undefined"?supabaseClient:window.supabaseClient;
const endpoint="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-account-v1",key="beagu-level-session-v1",own="beagu-account-session-v1";
let busy=false;const msg=s=>$("accountMessage").textContent=s;
const device=()=>{try{return localStorage.getItem("beagu-referral-device-secret-v1")||""}catch{return ""}};
const session=()=>sessionStorage.getItem(own)||"";
async function api(action,fields={},auth=false){
 const headers={"Content-Type":"application/json","X-Beagu-Session":session()};
 if(auth){const {data}=await client.auth.getSession();if(!data?.session?.access_token)throw Error("로그인이 필요합니다.");headers.Authorization="Bearer "+data.session.access_token;}
 const res=await fetch(endpoint,{method:"POST",headers,cache:"no-store",body:JSON.stringify({action,...fields})});
 const result=await res.json();if(!res.ok)throw Error("인증 또는 계정 확인에 실패했습니다. 원래 기기와 입력값을 확인하세요.");return result;
}
async function exclusive(fn){if(busy)return;busy=true;const controls=[...document.querySelectorAll("button")];controls.forEach(b=>b.disabled=true);try{await fn()}catch(e){msg(e.message||"처리 실패")}finally{busy=false;controls.forEach(b=>b.disabled=false);}}
function install(r){if(!/^[a-f0-9]{64}$/.test(r.token)||![1,2].includes(r.level))throw Error("인증 실패");sessionStorage.setItem(own,r.token);sessionStorage.setItem(key,r.token);msg(r.formal?"정식 계정 인증 완료 · 자료 열람 Lv.2":"가계정 로그인 완료 · Lv."+r.level);}
$("accountSignup").onsubmit=e=>{e.preventDefault();const f=e.currentTarget;const data=new FormData(f);const password=data.get("password");f.elements.password.value="";void exclusive(async()=>{
 const r=await api("signup",{code:String(data.get("code")).trim(),password,deviceSecret:device()});
 $("issuedAccount").hidden=false;$("issuedAccount").textContent="가계정 고유번호: "+r.account_id+" · 안전하게 보관하세요.";
 $("accountLogin").elements.account_id.value=r.account_id;msg("가입 완료. 고유번호와 비밀번호로 로그인하세요.");
});};
$("accountLogin").onsubmit=e=>{e.preventDefault();const f=e.currentTarget;const data=new FormData(f);const password=data.get("password");f.elements.password.value="";void exclusive(async()=>install(await api("password_login",{account_id:String(data.get("account_id")).trim(),password})));};
$("accountGoogle").onclick=()=>void exclusive(async()=>{if(!client)throw Error("인증 서비스 연결을 확인하세요.");const {error}=await client.auth.signInWithOAuth({provider:"google",options:{redirectTo:new URL("account.html",location.href).href}});if(error)throw Error("Google 로그인 설정을 확인하세요.");});
$("accountFormal").onsubmit=e=>{e.preventDefault();const data=new FormData(e.currentTarget);void exclusive(async()=>{await api("formal_link",{code:String(data.get("code")).trim(),deviceSecret:device()},true);sessionStorage.removeItem(own);sessionStorage.removeItem(key);install(await api("formal_login",{},true));});};
$("accountFormalLogin").onclick=()=>void exclusive(async()=>install(await api("formal_login",{},true)));
$("accountLogout").onclick=()=>void exclusive(async()=>{if(session())await api("logout");if(sessionStorage.getItem(key)===session())sessionStorage.removeItem(key);sessionStorage.removeItem(own);if(client)await client.auth.signOut();msg("로그아웃 완료");});
if(session())void exclusive(async()=>{const r=await api("status");msg(r.formal?"정식 계정 연결 완료 · 자료 열람 Lv.2":"가계정 인증 · Lv."+r.level)});
})();