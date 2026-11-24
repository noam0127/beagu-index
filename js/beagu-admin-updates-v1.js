/* Admin release center: all decisions authorized by AAL2-protected server.
 * The browser never receives GitHub credentials and never considers a queued job deployed.
 */
(() => {
 "use strict";
 const el=id=>document.getElementById(id);
 const auth=supabaseClient.auth;
 const api=SUPABASE_URL+"/functions/v1/beagu-release-manager-v1";
 const gate=SUPABASE_URL+"/functions/v1/beagu-admin-access";
 let busy=false,model=null,timer=null,cachedHead=null,cachedProposal=null,readyKey=null,lastKey=null,refreshSeq=0,liveSeq=0,liveSHA=null,liveVersion=null,liveCheckedAt=0,lastDispatch=null,wakeAt=0,refreshInFlight=false,refreshRequested=false;
 const SHA=/^[0-9a-f]{40}$/;
 const seconds=(a,b)=>{const x=Date.parse(a),y=b?Date.parse(b):Date.now();return Number.isFinite(x)&&Number.isFinite(y)?Math.max(0,Math.floor((y-x)/1000)):null;};
 const elapsed=n=>n===null?'—':Math.floor(n/60)+'분 '+n%60+'초';
 const date=value=>{if(!value)return "—";const d=new Date(value);
   return Number.isFinite(d.getTime())?d.toLocaleString("ko-KR"):"—";};
 const short=value=>value?String(value).slice(0,8):"—";
 function message(text,isError=false){
  const p=el("releaseStatus");p.textContent=text;
  p.classList.toggle("release-status-error",isError);
 }
 function denied(text){
  ++refreshSeq;++liveSeq;model=null;readyKey=null;liveSHA=null;el("releaseLogin").hidden=false;el("releaseDashboard").hidden=true;
  message(text,true);
 }
 async function request(action,payload={},endpoint=api){
  const {data,error}=await auth.getSession();
  if(error||!data?.session?.access_token)throw Error("관리자 세션이 만료되었습니다.");
  const response=await fetch(endpoint,{method:"POST",cache:"no-store",
   headers:{"Authorization":"Bearer "+data.session.access_token,
    "apikey":SUPABASE_PUBLISHABLE_KEY,"Content-Type":"application/json"},
   body:JSON.stringify({action,...payload}),signal:AbortSignal.timeout(45000)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok){
   const messages={
    release_in_progress:"다른 배포가 진행 중입니다. 완료 후 다시 시도하세요.",
    staging_is_stale:"현재 운영 웹보다 오래된 시험 버전으로는 배포할 수 없습니다.",
    no_changes_since_production:"현재 운영 버전과 비교해 변경된 파일이 없습니다. 최소 1개를 수정하세요.",
    release_bootstrap_pending:"배포 관리 시스템의 최초 배포가 아직 끝나지 않았습니다.",
    register_version_first:"먼저 새 업데이트의 버전과 변경 내용을 등록하세요.",
    direct_route_required:"직접 배포 관리자 화면을 새로고침하세요.",
    direct_ci_required:"이 커밋의 코드 검증이 아직 통과하지 않았습니다.",
    direct_candidate_stale:"현재 운영 버전을 포함하지 않는 후보입니다.",
    direct_confirmation_required:"배포 대상이 변경되었습니다. 새로고침하세요.",
    direct_draft_conflict:"등록 후보가 변경되었습니다. 새로고침하세요.",
    version_already_used:"같은 버전 이름으로 이미 다른 코드가 배포됐습니다.",
    stale_production_base:"운영 코드가 변경되었습니다. 이전 후보를 실행하지 않습니다.",
    staging_required:"시험 웹에 먼저 적용해 주세요.",
    already_on_staging:"이 버전은 이미 시험 웹에 적용되어 있습니다.",
    already_on_production:"이미 운영 웹에 적용된 버전입니다.",
    no_staging_rollback:"되돌릴 수 있는 이전 시험 버전이 없습니다.",
    no_production_rollback:"되돌릴 수 있는 이전 운영 버전이 없습니다.",
    admin_mfa_required:"관리자 2단계 인증이 필요합니다. 다시 로그인하세요.",
    github_unavailable:"GitHub 버전을 확인할 수 없습니다. 잠시 후 다시 시도하세요.",
    release_service_unavailable:"배포 서버가 응답하지 않습니다. 잠시 후 다시 확인하세요."
   };
   const error=Error(messages[result.error]||"요청 실패 ("+(result.error||response.status)+")");error.status=response.status;throw error;
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
 function renderJob(data){
  const s=data.state||{},current=data.job,recent=data.recent_jobs||[],job=current||recent[0],now=Date.now();
  const waiting=job?.status==="queued",running=job?.status==="running",published=job?.status==="deployed",failed=job?.status==="failed";
  const verified=!!s.production_sha&&liveSHA===s.production_sha;
  const targetVerified=published&&job.to_sha===liveSHA&&verified;
  write("releaseWaitTime",job?elapsed(seconds(job.created_at,job.started_at||job.finished_at)): "—");
  write("releaseRunTime",job?.started_at?elapsed(seconds(job.started_at,job.finished_at)): "—");
  write("releaseLiveProof",verified?"일치 · "+short(liveSHA):liveSHA?"불일치 · "+short(liveSHA):"확인 불가");
  const stages={approved:!!job,running:!!job?.started_at,deployed:published,verified:targetVerified};
  for(const node of el("releaseJobProgress").querySelectorAll("[data-phase]"))node.dataset.done=String(!!stages[node.dataset.phase]);
  const dispatch=data.dispatch_configured===true;
  write("releaseDispatchStatus",dispatch?(lastDispatch==="dispatch_rate_limited"?"재실행 요청 간격 제한 · 기존 요청 유지":lastDispatch==="dispatch_unavailable"?"즉시 실행 요청 실패 · 예약 실행 유지":lastDispatch==="dispatched"?"GitHub 즉시 실행 요청 전달 · 시작 대기":"즉시 실행 연결 사용 가능"):"즉시 실행용 서버 인증 미설정 · 예약 실행 또는 GitHub 수동 실행");
  const eligible=waiting&&["prod_apply","prod_rollback"].includes(job.action)&&job.from_sha===s.production_sha;
  el("releaseWake").hidden=!eligible||!dispatch;el("releaseWake").disabled=busy||!eligible||!dispatch||now-wakeAt<60000;
  el("releaseManualDispatch").hidden=!eligible;
  const reason=job?.error_code||"";
  write("releaseJobWarning",failed?"최근 작업 실패: "+reason+" · 다시 적용하기 전에 운영 코드 확인":waiting&&seconds(job.created_at)>=60?"승인 완료 · GitHub 실행 대기 중":running&&seconds(job.started_at)>=840?"실행 지연 · 중복 배포를 시작하지 마세요.":liveSHA&&liveSHA!==s.production_sha&&!current?"서버 기록과 실제 웹 코드가 다릅니다. 캐시 전파 또는 기록 오류 확인 필요":"");
  const list=el("releaseRecentJobs");list.replaceChildren();for(const j of recent){const item=document.createElement("article");item.className="release-history-item";const strong=document.createElement("strong");strong.textContent=j.version+" · "+({queued:"대기",running:"실행",deployed:"게시 완료",failed:"실패"}[j.status]||j.status);const p=document.createElement("p");p.textContent=short(j.from_sha)+" → "+short(j.to_sha)+" · "+date(j.created_at)+(j.error_code?" · "+j.error_code:"");item.append(strong,p);list.append(item);}
 }
 async function verifyLive(){
  const seq=++liveSeq;try{const res=await fetch("/release-info.json?check="+Date.now(),{cache:"no-store",signal:AbortSignal.timeout(7000)});if(!res.ok)throw Error();const meta=await res.json();if(seq!==liveSeq||!model)return;if(meta.environment!=="production"||!SHA.test(meta.commit))throw Error();liveSHA=meta.commit;liveVersion=meta.version;liveCheckedAt=Date.now();}catch{if(seq!==liveSeq)return;liveSHA=null;liveVersion=null;}if(model)render(model);
 }
 function render(data){
  model=data;
  const s=data.state||{},job=data.job,stageHist=data.staging_history||[],prodHist=data.production_history||[];
  if(data.head_sha)cachedHead=data.head_sha;
  if(data.suggested_draft)cachedProposal=data.suggested_draft;
  if(cachedProposal?.sha===s.production_sha)cachedProposal=null;
  write("releaseStageVersion",s.staging_sha?(s.staging_version||"과거 버전"):"과거 시험웹 기록 없음");
  write("releaseProdVersion",s.production_sha?(s.production_version||"버전 미입력"):"최초 배포 준비 중");
  write("releaseStageSha",s.staging_sha?"종료된 경로 · 과거 코드 "+short(s.staging_sha):"종료된 경로");
  write("releaseProdSha",s.production_sha?"코드 "+short(s.production_sha):"초기 배포 후 표시됩니다");
  write("releaseHead",cachedHead?"GitHub 최신 코드: "+short(cachedHead):"새로고침하면 GitHub 최신 코드를 확인합니다.");
  const key=String(s.production_sha||"")+":"+String(s.draft_sha||"");
  if(key!==lastKey){readyKey=null;lastKey=key;}
  if(data.direct_candidate_ready===true)readyKey=key;
  else if(data.direct_candidate_ready===false)readyKey=null;
  const candidate=data.direct_release_v1===true&&s.draft_sha?{sha:s.draft_sha,version:s.draft_version}:null;
  const ready=!!candidate&&readyKey===key;
  write("releaseDraftInfo",candidate?
    (ready?"검증 완료 · ":"검증 미확인 · ")+candidate.version+" · "+short(candidate.sha)+(ready?" · 실제 웹 적용 가능":" · 직접 적용 전 검증 필요"):
    s.draft_sha?"등록된 업데이트: "+s.draft_version+" ("+short(s.draft_sha)+")":"새 버전을 등록하세요.");
  if(s.draft_sha){
   if(!el("releaseCandidateSha").value&&s.draft_sha!==s.production_sha)el("releaseCandidateSha").value=s.draft_sha;
   if(document.activeElement!==el("releaseVersionInput"))el("releaseVersionInput").value=s.draft_version||"";
   if(document.activeElement!==el("releaseSummaryInput"))el("releaseSummaryInput").value=s.draft_summary||"";
  }
  const active=!!job;
  const mismatch=!!liveSHA&&liveSHA!==s.production_sha;
  write("releaseQueueText",active?
    ((job.status==="running"?"배포 중":"배포 대기")+" · "+job.version+
     " · "+(job.target==="staging"?"시험 웹":"실제 웹")+
     " · 요청 시각 "+date(job.created_at)):
    "현재 진행 중인 배포가 없습니다.");
  el("releaseStageApply").hidden=true;el("releaseStageApply").disabled=true;
  el("releaseStageRollback").hidden=true;el("releaseStageRollback").disabled=true;
  el("releaseProdApply").disabled=busy||active||mismatch||data.direct_release_v1!==true||!ready||!s.draft_sha||s.draft_sha===s.production_sha;
  const lastCodeRelease=prodHist.find(h=>h.action!=="data_refresh");
  el("releaseProdRollback").disabled=busy||active||mismatch||!lastCodeRelease||!lastCodeRelease.from_sha||lastCodeRelease.from_sha===s.production_sha;
  el("releaseRegister").disabled=busy||active||data.direct_release_v1!==true||!s.production_sha;
  el("releaseRefresh").disabled=busy;
  renderHistory("releaseStageHistory",stageHist);
  renderHistory("releaseProdHistory",prodHist);
  renderJob(data);
 }
 async function refresh(quiet=false){
  if(busy)return;
  if(refreshInFlight){if(!quiet)refreshRequested=true;return;}
  refreshInFlight=true;
  const seq=++refreshSeq;
  try{
   const data=await request("status",{check_latest:!quiet});
   if(seq!==refreshSeq||busy)return;
   el("releaseDashboard").hidden=false;el("releaseLogin").hidden=true;
   render(data);
   if(!quiet||!liveSHA||liveSHA!==data.state?.production_sha||Date.now()-liveCheckedAt>45000)void verifyLive();
   if(!quiet)message("업데이트 관리 연결 완료 · 서버 확인 상태");
  }catch(err){
   if(seq!==refreshSeq)return;
   if(err.status===401||err.status===403){denied("관리자 인증 필요: "+err.message);return;}
   readyKey=null;if(model)render(model);
   if(!quiet)message("배포 상태 조회 실패: "+(err.message||String(err)),true);
  }finally{refreshInFlight=false;if(refreshRequested&&!busy){refreshRequested=false;void refresh(false);}}
 }
 async function command(action){
  if(busy)return;
  if(action==="stage_apply"||action==="stage_rollback")return;
  if(action==="prod_apply"&&(el("releaseProdApply").disabled||!model?.state?.draft_sha))return;
  if(action==="prod_rollback"&&el("releaseProdRollback").disabled)return;
  const snapshot=model?.state?{...model.state}:null,rollback=model?.production_history?.find(h=>h.action!=="data_refresh")?.from_sha;
  if(!snapshot)return;
  const wording={
   stage_apply:"등록된 버전을 시험 웹에 적용하시겠습니까?",
   stage_rollback:"시험 웹을 바로 이전 버전으로 되돌리시겠습니까?",
   prod_apply:"등록된 독립 버전 "+String(model?.state?.draft_version||"")+" ("+short(model?.state?.draft_sha)+")을 실제 웹에 적용하시겠습니까? 시험웹은 사용하지 않습니다.",
   prod_rollback:"실제 웹 "+short(snapshot.production_sha)+" → "+short(rollback)+" 복원하시겠습니까? 모든 방문자에게 적용됩니다."
  };
  if(!window.confirm(wording[action]))return;
  busy=true;++refreshSeq;if(model)render(model);
  try{
   if(action==="prod_apply"&&model?.direct_release_v1!==true)throw Error("직접 적용 서버가 아직 활성화되지 않았습니다.");
   const result=action==="prod_apply"?await request("prod_direct_apply",{candidate_sha:snapshot.draft_sha,expected_production_sha:snapshot.production_sha,confirmed_direct:true}):await request(action,{expected_production_sha:snapshot.production_sha,expected_rollback_sha:rollback,confirmed_direct:true});
   lastDispatch=result.dispatch||null;
   message("배포 승인 등록 완료 ("+result.job_id.slice(0,8)+"). "+(lastDispatch==="dispatched"?"GitHub 실행 요청을 전달했습니다.":"예약 실행 대기 중입니다. 필요하면 GitHub에서 실행하세요."));
  }catch(err){message(err.message,true)}
  finally{busy=false;await refresh(true);}
 }
 async function register(event){
  event.preventDefault();if(busy)return;
  const version=el("releaseVersionInput").value.trim();
  const summary=el("releaseSummaryInput").value.trim();
  const candidate_sha=el("releaseCandidateSha").value.trim();
  if(!version||summary.length<3||!/^[0-9a-f]{40}$/.test(candidate_sha)||model?.direct_release_v1!==true)return;
  const old=model?.state?.draft_sha;
  const replace=old&&old!==candidate_sha&&old!==model?.state?.production_sha;
  if(replace&&!window.confirm("기존 등록 후보 "+short(old)+"를 이번 독립 후보로 교체하시겠습니까? GitHub 기록은 유지됩니다."))return;
  busy=true;++refreshSeq;if(model)render(model);el("releaseRegister").disabled=true;
  message("GitHub 최신 코드에서 변경된 파일을 확인하는 중입니다.");
  try{
   const result=await request("register_direct",{version,candidate_sha,...(replace?{replace_draft_sha:old}:{})});
   const list=el("releaseChangedFiles");list.replaceChildren();
   for(const name of result.changed_files||[]){
    const item=document.createElement("li");item.textContent=name;list.append(item);
   }
   el("releaseFileSummary").hidden=false;
   message("업데이트 등록 완료 · "+result.changed_count+"개 변경 파일 확인. 등록 후보를 확인한 후 '실제 웹 적용'을 누르세요.");
  }catch(err){message(err.message,true)}
  finally{busy=false;await refresh(false);}
 }
 el("releaseDraftForm").addEventListener("submit",register);
 for(const [id,action] of [
  ["releaseStageApply","stage_apply"],["releaseStageRollback","stage_rollback"],
  ["releaseProdApply","prod_apply"],["releaseProdRollback","prod_rollback"]])
    el(id).addEventListener("click",()=>void command(action));
 el("releaseRefresh").addEventListener("click",()=>void refresh(false));
 el("releaseWake").addEventListener("click",async()=>{const j=model?.job;if(busy||el("releaseWake").disabled||!j||j.status!=="queued")return;busy=true;++refreshSeq;wakeAt=Date.now();render(model);try{const r=await request("wake_approved_job",{job_id:j.id,candidate_sha:j.to_sha});lastDispatch=r.dispatch;message(r.dispatch==="dispatched"?"승인된 작업의 실행 요청 전달 완료":"실행 요청 미완료 · 예약 실행 유지",r.dispatch!=="dispatched");}catch(e){message(e.message,true)}finally{busy=false;await refresh(true)}});
 (async()=>{
  try{
   const proof=await request("verify",{},gate);
   if(!proof.permitted||!proof.mfa_verified||proof.role!=="owner")
    throw Error("최고 관리자 권한과 2단계 인증이 필요합니다.");
   await refresh();
   timer=setInterval(()=>{if(!document.hidden&&!busy)void refresh(true)},10000);
  }catch(err){denied("관리자 인증 필요: "+err.message);}
 })();
 window.addEventListener("pagehide",()=>{++refreshSeq;++liveSeq;if(timer)clearInterval(timer)});
 window.addEventListener("pageshow",event=>{if(event.persisted){void refresh(false);if(timer)clearInterval(timer);timer=setInterval(()=>{if(!document.hidden&&!busy)void refresh(true)},10000);}});
})();
