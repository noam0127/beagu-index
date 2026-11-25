/* Read a selected native Google Sheet as displayed. Never store or forward Google tokens. */
(()=>{
"use strict";
const SCOPE="https://www.googleapis.com/auth/spreadsheets.readonly";
const validClientId=s=>typeof s==="string"&&/^[A-Za-z0-9_-]{1,200}\.apps\.googleusercontent\.com$/.test(s);
function source(link){
 let u;try{u=new URL(String(link).trim());}catch{throw Error("Google 스프레드시트 링크를 입력하세요.");}
 const m=/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,160})(?:\/(?:edit|view|preview))?\/?$/.exec(u.pathname);
 if(u.origin!=="https://docs.google.com"||u.username||u.password||!m)throw Error("Google 스프레드시트 원본 링크만 사용할 수 있습니다.");
 const g=u.searchParams.get("gid"),h=new URLSearchParams(u.hash.slice(1)).get("gid");
 if(g!==null&&h!==null&&g!==h)throw Error("시트 링크가 올바르지 않습니다.");
 const gid=g??h;if(gid!==null&&(!/^\d{1,10}$/.test(gid)||Number(gid)>2147483647))throw Error("시트 번호가 올바르지 않습니다.");
 return {id:m[1],gid:gid===null?null:Number(gid)};
}
let loading;
function prepare(){
 if(window.google?.accounts?.oauth2?.initTokenClient)return Promise.resolve();
 if(loading)return loading;
 loading=new Promise((resolve,reject)=>{
  const s=document.createElement("script");s.src="https://accounts.google.com/gsi/client";s.async=true;s.referrerPolicy="no-referrer";
  s.onload=()=>window.google?.accounts?.oauth2?.initTokenClient?resolve():reject(Error("Google 인증을 불러오지 못했습니다."));
  s.onerror=()=>{loading=null;s.remove();reject(Error("Google 인증을 불러오지 못했습니다."));};document.head.append(s);
 });return loading;
}
function authorize(clientId){
 if(!validClientId(clientId)||!window.google?.accounts?.oauth2?.initTokenClient)return Promise.reject(Error("Google 웹 OAuth 클라이언트 ID와 인증 준비를 확인하세요."));
 return new Promise((resolve,reject)=>{
  const client=window.google.accounts.oauth2.initTokenClient({
   client_id:clientId,scope:SCOPE,include_granted_scopes:false,
   callback:r=>{if(r?.error||typeof r?.access_token!=="string"||!String(r.scope||"").split(/\s+/).includes(SCOPE))reject(Error("Google 스프레드시트 읽기 권한이 필요합니다."));else resolve(r.access_token);},
   error_callback:()=>reject(Error("Google 인증이 취소되었거나 팝업이 차단되었습니다."))
  });
  // Must be invoked directly from the administrator's click.
  client.requestAccessToken({prompt:""});
 });
}
async function get(url,token){
 const r=await fetch(url,{method:"GET",headers:{Authorization:"Bearer "+token},cache:"no-store",credentials:"omit",redirect:"error"});
 if(!r.ok)throw Error(r.status===401||r.status===403?"Google 계정의 읽기 권한 또는 Sheets API 설정을 확인하세요.":r.status===404?"스프레드시트 또는 시트를 찾을 수 없습니다.":"Google 스프레드시트 조회 실패: "+r.status);
 const max=8000000;
 if(Number(r.headers.get("content-length")||0)>max)throw Error("편집본이 너무 큽니다.");
 const reader=r.body?.getReader();if(!reader)throw Error("Google 응답 없음");
 const d=new TextDecoder();let total=0,s="";
 while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();throw Error("편집본이 너무 큽니다.");}s+=d.decode(value,{stream:true});}
 return JSON.parse(s+d.decode());
}
async function read(ref,token){
 const base="https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(ref.id);
 const meta=await get(base+"?fields="+encodeURIComponent("sheets(properties(sheetId,title,sheetType))"),token);
 const sheets=(meta.sheets||[]).map(s=>s.properties).filter(p=>p&&p.sheetType==="GRID"&&typeof p.title==="string");
 const sheet=ref.gid!==null?sheets.find(s=>s.sheetId===ref.gid):sheets.find(s=>s.title==="2026")||(sheets.length===1?sheets[0]:null);
 if(!sheet)throw Error("최종 편집본 시트를 열고 해당 탭의 링크를 복사하세요.");
 const range="'"+sheet.title.replaceAll("'","''")+"'";
 const data=await get(base+"/values/"+encodeURIComponent(range)+"?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE",token);
 const table=data.values;
 if(!Array.isArray(table)||table.length<2||table.length>7001||!table.every(r=>Array.isArray(r)&&r.length<=140))throw Error("학교 자료는 7000행, 140열 이하여야 합니다.");
 const h=table[0];
 if(h[0]!=="학교ID"||h[1]!=="백분위"||new Set(h).size!==h.length||h.slice(2).some(x=>typeof x!=="string"||!/^Q(?:0[1-9]|[1-4]\d|50|51)(?:[._-]\d+)?$/.test(x)))throw Error("최종 편집본의 열 제목을 확인하세요. 학교ID, 백분위, Q01 등만 허용됩니다.");
 if(table.some(r=>r.length>h.length))throw Error("제목 없는 자료 열이 있습니다.");
 const keep=h.map((v,i)=>/^Q(?:31|51)(?:[._-]\d+)?$/.test(v)?-1:i).filter(i=>i>=0);
 return table.filter((r,i)=>i===0||r.some(v=>v!==""&&v!==null&&v!==undefined)).map(r=>keep.map(i=>r[i]??""));
}
window.BeaguEditedSheet={source,prepare,authorize,read,validClientId};
})();
