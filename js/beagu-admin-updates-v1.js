/* Admin release center: all decisions authorized by AAL2-protected server.
 * The browser never receives GitHub credentials and never considers a queued job deployed.
 */
(() => {
 "use strict";
 const el=id=>document.getElementById(id);
 const auth=supabaseClient.auth;
 const api=SUPABASE_URL+"/functions/v1/beagu-release-manager-v1";
 const gate=SUPABASE_URL+"/functions/v1/beagu-admin-access";
 let busy=false,model=null,timer=null,cachedHead=null,cachedProposal=null;
 const date=value=>{if(!value)return "—";const d=new Date(value);
   return Number.isFinite(d.getTime())?d.toLocaleString("ko-KR"):"—";};
 const short=value=>value?String(value).slice(0,8):"—";
 function message(text,isError=false){
  const p=el("releaseStatus");p.textContent=text;
  p.classList.toggle("release-status-error",isError);
 }
 function denied(text){
  el("releaseLogin").hidden=false;el("releaseDashboard").hidden=true;
  message(text,true);
 }
 async function request(action,payload={},endpoint=api){
  const {data,error}=await auth.getSession();
  if(error||!data?.session?.access_token)throw Error("관리자 세션이 만료되었습니다.");
  const response=await fetch(endpoint,{method:"POST",cache:"no-store",
   headers:{"Authorization":"Bearer "+data.session.access_token,
    "apikey":SUPABASE_PUBLISHABLE_KEY,"Content-Type":"application/json"},
   body:JSON.stringify({action,...payload})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok){
   const messages={
    release_in_progress:"다른 배포가 진행 중입니다. 완료 후 다시 시도하세요.",
    no_changes_since_production:"현재 운영 버전과 비교해 변경된 파일이 없습니다. 최소 1개를 수정하세요.",
    release_bootstrap_pending:"배포 관리 시스템의 최초 배포가 아직 끝나지 않았습니다.",
    register_version_first:"먼저 새 업데이트의 버전과 변경 내용을 등록하세요.",
    staging_required:"시험 웹에 먼저 적용해 주세요.",
    already_on_staging:"이 버전은 이미 시험 웹에 적용되어 있습니다.",
    already_on_production:"이미 운영 웹에 적용된 버전입니다.",
    no_staging_rollback:"되돌릴 수 있는 이전 시험 버전이 없습니다.",
    no_production_rollback:"되돌릴 수 있는 이전 운영 버전이 없습니다.",
    admin_mfa_required:"관리자 2단계 인증이 필요합니다. 다시 로그인하세요.",
    github_unavailable:"GitHub 버전을 확인할 수 없습니다. 잠시 후 다시 시도하세요.",
    release_service_unavailable:"배포 서버가 응답하지 않습니다. 잠시 후 다시 확인하세요."
   };
   throw Error(messages[result.error]||"요청 실패 ("+(result.error||response.status)+")");
  }
  return result;
 }
 function write(id,value){el(id).textContent=value;}
 function renderHistory(id,rows){
  const root=el(id);root.replaceChildren();
  if(!rows?.length){const p=document.createElement("p");p.className="subtle";
   p.textContent="아직 배포 기록이 없습니다.";root.append(p);return;}
  for(const entry of rows){
   const item=document.createElement("article");item.className="release-history-item";
   const title=document.createElement("strong");title.textContent=entry.version+" · "+
    (entry.action.includes("rollback")?"이전 버전으로 복원":
      entry.action==="bootstrap"?"최초 설치":"업데이트 적용");
   const when=document.createElement("div");when.className="subtle";when.textContent=date(entry.deployed_at);
   const desc=document.createElement("p");desc.textContent=entry.summary||"변경 내용 없음";
   const sha=document.createElement("code");sha.textContent=short(entry.from_sha)+" → "+short(entry.to_sha);
   item.append(title,when,desc,sha);root.append(item);
  }
 }
 function render(data){
  model=data;
  const s=data.state||{},job=data.job,stageHist=data.staging_history||[],prodHist=data.production_history||[];
  if(data.head_sha)cachedHead=data.head_sha;
  if(data.suggested_draft)cachedProposal=data.suggested_draft;
  if(cachedProposal?.sha===s.production_sha)cachedProposal=null;
  write("releaseStageVersion",s.staging_sha?(s.staging_version||"버전 미입력"):"아직 시험 웹 미배포");
  write("releaseProdVersion",s.production_sha?(s.production_version||"버전 미입력"):"최초 배포 준비 중");
  write("releaseStageSha",s.staging_sha?"코드 "+short(s.staging_sha):"시험 웹에 아직 업데이트가 없습니다");
  write("releaseProdSha",s.production_sha?"코드 "+short(s.production_sha):"초기 배포 후 표시됩니다");
  write("releaseHead",cachedHead?"GitHub 최신 코드: "+short(cachedHead):"새로고침하면 GitHub 최신 코드를 확인합니다.");
  const candidate=cachedProposal&&cachedProposal.sha!==s.staging_sha?cachedProposal:null;
  write("releaseDraftInfo",candidate?
    "ChatGPT 입력 버전 "+candidate.version+" · 시험 웹 적용 버튼으로 바로 배포 가능":
    s.draft_sha?"등록된 업데이트: "+s.draft_version+" ("+short(s.draft_sha)+")":"새 버전을 등록하세요.");
  if(s.draft_sha){
   if(document.activeElement!==el("releaseVersionInput"))el("releaseVersionInput").value=s.draft_version||"";
   if(document.activeElement!==el("releaseSummaryInput"))el("releaseSummaryInput").value=s.draft_summary||"";
  }
  const active=!!job;
  write("releaseQueueText",active?
    ((job.status==="running"?"배포 중":"배포 대기")+" · "+job.version+
     " · "+(job.target==="staging"?"시험 웹":"실제 웹")+
     " · 요청 시각 "+date(job.created_at)):
    "현재 진행 중인 배포가 없습니다.");
  el("releaseStageApply").disabled=busy||active||!s.production_sha||
    (!candidate&&(!s.draft_sha||s.draft_sha===s.staging_sha));
  el("releaseStageRollback").disabled=busy||active||!stageHist.length||stageHist[0].from_sha===s.staging_sha;
  el("releaseProdApply").disabled=busy||active||!s.staging_sha||s.staging_sha===s.production_sha;
  const lastCodeRelease=prodHist.find(h=>h.action!=="data_refresh");
  el("releaseProdRollback").disabled=busy||active||!lastCodeRelease||!lastCodeRelease.from_sha||lastCodeRelease.from_sha===s.production_sha;
  el("releaseRegister").disabled=busy||active||!s.production_sha;
  el("releaseRefresh").disabled=busy;
  renderHistory("releaseStageHistory",stageHist);
  renderHistory("releaseProdHistory",prodHist);
 }
 async function refresh(quiet=false){
  if(busy)return;
  try{
   const data=await request("status",{check_latest:!quiet});
   el("releaseDashboard").hidden=false;el("releaseLogin").hidden=true;
   render(data);
   if(!quiet)message("업데이트 관리 연결 완료 · 서버 확인 상태");
  }catch(err){
   if(!quiet)message("배포 상태 조회 실패: "+(err.message||String(err)),true);
  }
 }
 async function command(action){
  if(busy)return;
  const wording={
   stage_apply:"등록된 버전을 시험 웹에 적용하시겠습니까?",
   stage_rollback:"시험 웹을 바로 이전 버전으로 되돌리시겠습니까?",
   prod_apply:"시험 웹에서 직접 구동을 확인했고 이상이 없습니까? 동일한 코드 버전을 실제 웹에 배포합니다.",
   prod_rollback:"실제 웹을 바로 이전 버전으로 되돌리시겠습니까? 모든 방문자에게 적용됩니다."
  };
  if(!window.confirm(wording[action]))return;
  busy=true;
  try{
   const result=await request(action,action==="prod_apply"?{confirmed_tested:true}:{});
   message("배포 요청 등록 완료 ("+result.job_id.slice(0,8)+"). 완료되면 아래 버전 기록이 바뀝니다.");
  }catch(err){message(err.message,true)}
  finally{busy=false;await refresh(true);}
 }
 async function register(event){
  event.preventDefault();if(busy)return;
  const version=el("releaseVersionInput").value.trim();
  const summary=el("releaseSummaryInput").value.trim();
  if(!version||summary.length<3)return;
  busy=true;el("releaseRegister").disabled=true;
  message("GitHub 최신 코드에서 변경된 파일을 확인하는 중입니다.");
  try{
   const result=await request("register",{version,summary});
   const list=el("releaseChangedFiles");list.replaceChildren();
   for(const name of result.changed_files||[]){
    const item=document.createElement("li");item.textContent=name;list.append(item);
   }
   el("releaseFileSummary").hidden=false;
   message("업데이트 등록 완료 · "+result.changed_count+"개 변경 파일 확인. 이제 '시험 웹 적용'을 누르세요.");
  }catch(err){message(err.message,true)}
  finally{busy=false;await refresh(true);}
 }
 el("releaseDraftForm").addEventListener("submit",register);
 for(const [id,action] of [
  ["releaseStageApply","stage_apply"],["releaseStageRollback","stage_rollback"],
  ["releaseProdApply","prod_apply"],["releaseProdRollback","prod_rollback"]])
    el(id).addEventListener("click",()=>void command(action));
 el("releaseRefresh").addEventListener("click",()=>void refresh(false));
 (async()=>{
  try{
   const proof=await request("verify",{},gate);
   if(!proof.permitted||!proof.mfa_verified||proof.role!=="owner")
    throw Error("최고 관리자 권한과 2단계 인증이 필요합니다.");
   await refresh();
   timer=setInterval(()=>{if(!document.hidden)void refresh(true)},15000);
  }catch(err){denied("관리자 인증 필요: "+err.message);}
 })();
 window.addEventListener("pagehide",()=>{if(timer)clearInterval(timer)});
})();
