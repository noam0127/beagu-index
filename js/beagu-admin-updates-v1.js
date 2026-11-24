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
 const DIGEST=/^[0-9a-f]{64}$/;
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
 const integratedOrder=["backup","apply_sql","apply_scheduler","deploy_edge","verify_backend","publish_pages","verify_live"];
 const integratedLabels={backup:"암호화 백업·복원 검증",apply_sql:"DB 변경",apply_scheduler:"예약 작업 변경",deploy_edge:"Edge 서버 적용",verify_backend:"서버 검증",publish_pages:"웹 적용",verify_live:"실제 웹 검증",finalize:"최종 버전 기록"};
 const kindLabels={db_review:"DB",scheduler_review:"예약 작업",edge_review:"Edge",edge_shared_review:"공용 서버 의존성",controller_review:"관제탑",config_review:"설정",ci_review:"CI",web_review:"웹",manual_review:"수동 검토"};
 const checkLabels={backup_review:"백업 및 복원",database_review:"DB 변경 확인",edge_review:"Edge 변경 확인",server_verification:"서버 검증",pages_verification:"웹 검증",post_release_verification:"최종 적용 확인"};
 let integratedPlan=null,integratedJob=null,integratedKey=null,integratedSeq=0,integratedLoading=false,integratedError="";
 function integratedStateKey(data){const s=data?.state||{};return [s.production_sha,s.draft_sha,s.draft_version,s.draft_summary].join("\u0000");}
 function clearIntegrated(){++integratedSeq;integratedPlan=null;integratedJob=null;integratedLoading=false;integratedError="";el("integratedJobId").value="";}
 function validReview(data,s){
  const p=data?.plan;
  return data?.approved===false&&data.execution_enabled===false&&DIGEST.test(data.plan_sha256||"")&&p?.schema===1&&p.policy==="integrated-review-v1"&&p.execution_enabled===false&&p.base_sha===s.production_sha&&p.candidate_sha===s.draft_sha&&p.version===s.draft_version&&p.summary===s.draft_summary&&typeof p.backend_required==="boolean"&&Array.isArray(p.inventory)&&p.inventory.length>0&&p.inventory.length<300&&p.inventory.every(f=>typeof f.path==="string"&&typeof f.status==="string"&&Array.isArray(f.review_kinds)&&typeof f.backend==="boolean")&&Array.isArray(p.required_checks);
 }
 function validIntegratedJob(job,s,plan){
  return job?.scope==="isolated_fixture_only"&&job.execution_enabled===false&&UUID.test(job.id||"")&&job.base_sha===s.production_sha&&job.candidate_sha===s.draft_sha&&job.plan_sha===plan?.plan_sha256&&["queued","running","blocked","verified","completed","abandoned"].includes(job.status)&&Number.isInteger(job.task_count)&&job.task_count>=2&&job.task_count<=100&&Array.isArray(job.steps)&&job.steps.length===job.task_count&&job.steps.every((step,i)=>step.idx===i&&integratedOrder.includes(step.task?.op)&&["pending","running","done","blocked"].includes(step.status)&&(step.status!=="done"||DIGEST.test(step.evidence||"")));
 }
 function integratedList(id,items){
  const root=el(id);root.replaceChildren();
  for(const value of items){const node=document.createElement("li");node.textContent=value;root.append(node);}
 }
 function renderIntegrated(data){
  const s=data?.state||{},key=integratedStateKey(data);
  if(key!==integratedKey){clearIntegrated();integratedKey=key;}
  if(data?.job&&(integratedPlan||integratedLoading||integratedJob))clearIntegrated();
  const candidate=SHA.test(s.production_sha||"")&&SHA.test(s.draft_sha||"")&&s.production_sha!==s.draft_sha;
  write("integratedBase",s.production_sha||"—");write("integratedCandidate",s.draft_sha||"—");
  el("integratedInspect").disabled=busy||integratedLoading||!!data?.job||!candidate;
  el("integratedApply").disabled=true;el("integratedRecoveryApply").disabled=true;
  el("integratedJobLookup").disabled=busy||integratedLoading||!!data?.job||!integratedPlan;
  const p=integratedPlan?.plan,job=integratedJob;
  write("integratedNotice",integratedLoading?"서버 검증 결과 조회 중":integratedError||(!candidate?"검토할 독립 후보가 없습니다.":p?(p.backend_required?"통합 적용 필요 · 운영 실행 잠금":"웹 변경 전용 후보 · 기존 직접 적용 경로 사용"):"등록 후보의 검토 명세를 조회하세요."));
  el("integratedReview").hidden=!p;
  if(p){
   write("integratedVersion",p.version);write("integratedSummary",p.summary);
   write("integratedDigest",integratedPlan.plan_sha256);
   write("integratedCounts",p.inventory.length+"개 파일 · 서버 관련 "+p.inventory.filter(f=>f.backend).length+"개");
   write("integratedManual",p.requires_manual_review||p.requires_shared_dependency_review?"수동 검토 또는 공용 의존성 검증 필요 · 실행 잠금":"명세 조회 완료 · 별도 승인 및 운영 연결 필요");
   integratedList("integratedFiles",p.inventory.map(f=>f.review_kinds.map(k=>kindLabels[k]||"기타 검토").join(" / ")+" · "+f.status+" · "+f.path));
   integratedList("integratedChecks",p.required_checks.map(k=>checkLabels[k]||"추가 확인"));
  }else{
   for(const id of ["integratedVersion","integratedSummary","integratedDigest","integratedCounts","integratedManual"])write(id,"—");
   integratedList("integratedFiles",[]);integratedList("integratedChecks",[]);
  }
  const stages=el("integratedSteps");stages.replaceChildren();
  const labels={pending:"대기",running:"실행 중",done:"검증 기록 있음",blocked:"중단"};
  const steps=job?job.steps.map(step=>({op:step.task.op,label:integratedLabels[step.task.op]+(step.task.op==="deploy_edge"&&typeof step.task.edge_function==="string"?" · "+step.task.edge_function:""),status:step.status})):
   (p?.backend_required===false?["publish_pages","verify_live"]:integratedOrder).map(op=>({op,label:integratedLabels[op],status:"planned"}));
  steps.push({op:"finalize",label:integratedLabels.finalize,status:job?.status==="completed"?"done":job?.status==="blocked"?"blocked":job?"pending":"planned"});
  for(const step of steps){const li=document.createElement("li");li.dataset.state=step.status;
   const name=document.createElement("span");name.textContent=step.label;
   const status=document.createElement("strong");status.textContent=labels[step.status]||"계획";
   li.append(name,status);stages.append(li);}
  write("integratedProgress",job?"격리 검증 기록 · "+({queued:"대기",running:"실행 중",blocked:"중단 · 복구 검토 필요",verified:"검증 완료 · 최종 기록 전",completed:"격리 최종 기록 완료",abandoned:"변경 전 취소"}[job.status])+" · 운영 적용 아님":"실제 작업 기록 없음 · 위 순서는 실행 계획입니다.");
  const records=Array.isArray(job?.recovery)?job.recovery:[];
  write("integratedRecovery",job?.status==="blocked"?"오류로 중단되었습니다. 원본 데이터 보존 및 별도 복구 승인 필요 · 자동 재시도 금지":job?.status==="abandoned"?"변경 전 취소된 격리 작업":records.length?"복구 검토 기록 "+records.length+"건 · 운영 복구 아님":"복구 기록 없음");
 }
 async function inspectIntegrated(){
  if(el("integratedInspect").disabled||!model)return;
  const s={...model.state},key=integratedKey,seq=++integratedSeq;
  integratedPlan=null;integratedJob=null;integratedLoading=true;integratedError="";
  renderIntegrated(model);
  try{
   const data=await request("inspect_integrated_plan",{candidate_sha:s.draft_sha,expected_production_sha:s.production_sha});
   if(seq!==integratedSeq||key!==integratedKey||busy||!model)return;
   if(!validReview(data,model.state))throw Error("검토 명세가 현재 후보와 일치하지 않습니다.");
   // Recompute the exact server JSON digest. A reviewed plan never constitutes approval.
   const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(data.plan)));
   const actual=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
   if(seq!==integratedSeq||key!==integratedKey||busy||!model)return;
   if(actual!==data.plan_sha256)throw Error("검토 명세 무결성 확인 실패");
   integratedPlan=data;
  }catch(e){
   if(seq!==integratedSeq)return;
   integratedError="명세 조회 실패 · 다시 검토 필요";
   if(e.status===401||e.status===403){denied("관리자 인증 필요");return;}
  }finally{if(seq===integratedSeq){integratedLoading=false;if(model)renderIntegrated(model);}}
 }
 async function lookupIntegrated(event){
  event.preventDefault();
  const id=el("integratedJobId").value.trim();
  if(el("integratedJobLookup").disabled||!UUID.test(id)||!model)return;
  const seq=++integratedSeq,key=integratedKey;integratedLoading=true;integratedJob=null;integratedError="";renderIntegrated(model);
  try{
   const job=await request("integrated_fixture_status",{job_id:id});
   if(seq!==integratedSeq||key!==integratedKey||!model||busy)return;
   if(job.id!==id||!validIntegratedJob(job,model.state,integratedPlan))throw Error("작업 기록 불일치");
   integratedJob=job;
  }catch(e){
   if(seq!==integratedSeq)return;
   integratedError="격리 작업 조회 불가 · 실제 적용 상태로 간주하지 않습니다.";
   if(e.status===401||e.status===403){denied("관리자 인증 필요");return;}
  }finally{if(seq===integratedSeq){integratedLoading=false;if(model)renderIntegrated(model);}}
 }
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
  ++refreshSeq;++liveSeq;clearIntegrated();integratedKey=null;model=null;readyKey=null;liveSHA=null;el("releaseLogin").hidden=false;el("releaseDashboard").hidden=true;
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
    backend_integrated_required:"서버 변경이 포함된 버전입니다. 통합 적용 준비가 완료될 때까지 웹 단독 적용을 차단합니다.",
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
  const ready=!!candidate&&readyKey===key&&data.direct_candidate_reason!=="backend_integrated_required";
  write("releaseDraftInfo",candidate?
    (ready?"검증 완료 · ":"검증 미확인 · ")+candidate.version+" · "+short(candidate.sha)+(ready?" · 실제 웹 적용 가능":data.direct_candidate_reason==="backend_integrated_required"?" · 통합 적용 필요 · 웹 단독 적용 차단":" · 직접 적용 전 검증 필요"):
    s.draft_sha?"등록된 업데이트: "+s.draft_version+" ("+short(s.draft_sha)+")":"새 버전을 등록하세요.");
  // Server status and the independent registration form are separate.
  // Polling, manual refresh and live SHA verification must never write form values.
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
  renderIntegrated(data);
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
   readyKey=null;clearIntegrated();if(model)render(model);
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
  busy=true;++refreshSeq;clearIntegrated();if(model)render(model);
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
  busy=true;++refreshSeq;clearIntegrated();if(model)render(model);el("releaseRegister").disabled=true;
  message("GitHub 최신 코드에서 변경된 파일을 확인하는 중입니다.");
  try{
   const result=await request("register_direct",{version,candidate_sha,...(replace?{replace_draft_sha:old}:{})});
   const list=el("releaseChangedFiles");list.replaceChildren();
   for(const name of result.changed_files||[]){
    const item=document.createElement("li");item.textContent=name;list.append(item);
   }
   el("releaseFileSummary").hidden=false;
   // Clear only the exact successfully submitted input; preserve later edits.
   if(el("releaseCandidateSha").value.trim()===candidate_sha&&el("releaseVersionInput").value.trim()===version&&el("releaseSummaryInput").value.trim()===summary){
    for(const id of ["releaseCandidateSha","releaseVersionInput","releaseSummaryInput"])el(id).value="";
   }
   message("업데이트 등록 완료 · "+result.changed_count+"개 변경 파일 확인. 통합 적용 필요 여부를 먼저 확인하세요.");
  }catch(err){message(err.message,true)}
  finally{busy=false;await refresh(false);}
 }
 el("integratedInspect").addEventListener("click",()=>void inspectIntegrated());
 el("integratedJobForm").addEventListener("submit",event=>void lookupIntegrated(event));
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
 window.addEventListener("pagehide",()=>{++refreshSeq;++liveSeq;clearIntegrated();if(timer)clearInterval(timer)});
 window.addEventListener("pageshow",event=>{if(event.persisted){void refresh(false);if(timer)clearInterval(timer);timer=setInterval(()=>{if(!document.hidden&&!busy)void refresh(true)},10000);}});
})();
