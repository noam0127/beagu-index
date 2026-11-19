(() => {'use strict';
const PROD='snvzwrexuqavnfvzgxqj';
const cfg=window.BEAGU_STAGE_CONFIG||{};
const params=new URLSearchParams(location.hash.replace(/^#/,''));
const hash=params.get('token_hash')||'';
history.replaceState(null,'',location.pathname);
const status=document.getElementById('status');
const form=document.getElementById('form');
function ready(){
 try{return cfg.enabled===true&&cfg.projectRef!==PROD&&/^[a-z]{20}$/.test(cfg.projectRef)&&
 new URL(cfg.endpoint).origin==='https://'+cfg.projectRef+'.supabase.co'&&
 new URL(cfg.endpoint).pathname==='/functions/v1/beagu-test-v1'&&
 cfg.siteOrigin===location.origin;}catch{return false;}
}
if(!ready()) {status.textContent='독립 테스트 서버가 아직 연결되지 않았습니다.';return;}
if(!/^[a-f0-9]{64}$/.test(hash)){status.textContent='유효한 복구 링크가 아닙니다.';return;}
form.hidden=false;status.textContent='새 비밀번호를 입력해 주세요.';
form.addEventListener('submit',async e=>{
 e.preventDefault();
 const a=document.getElementById('pw').value,b=document.getElementById('pw2').value;
 if(a!==b){status.textContent='비밀번호가 일치하지 않습니다.';return;}
 const button=form.querySelector('button');button.disabled=true;
 try{
  const res=await fetch(cfg.endpoint,{method:'POST',cache:'no-store',
   credentials:'omit',referrerPolicy:'no-referrer',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({action:'recover',tokenHash:hash,password:a})});
  const out=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(out.error||'복구 실패');
  form.hidden=true;status.textContent='비밀번호가 변경되었습니다. 다시 로그인하세요.';
 }catch(error){status.textContent=error.message||'복구 실패';}
 finally{button.disabled=false;}
});
})();