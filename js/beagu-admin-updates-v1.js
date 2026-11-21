/* Owner-only release center.
 * GitHub commits are automatically listed; "버전 생성" freezes main HEAD.
 * Every deployment chooses a saved immutable snapshot by catalog ID.
 * Supabase AAL2 owner verification and GitHub OIDC guard the server commands.
 */
(()=>{
 "use strict";
 const el=id=>document.getElementById(id);
 const auth=supabaseClient.auth;
 const api=SUPABASE_URL+"/functions/v1/beagu-release-manager-v1";
 const gate=SUPABASE_URL+"/functions/v1/beagu-admin-access";
 const date=value=>{if(!value)return "—";const d=new Date(value);
  return Number.isFinite(d.getTime())?d.toLocaleString("ko-KR"):"—";};
 const short=value=>value?String(value).slice(0,8):"—";
 let busy=false,model=null,timer=null,latestHead=null,pending=null;
 let versions=[],recentSuggestion=null,workInProgress=[],workInbox=null,commitScanError=null;
 const msg=(text,problem=false)=>{
  const p=el("releaseStatus");p.textContent=text;
  p.classList.toggle("release-status-error",problem);
 };
 function denied(text){
  el("releaseLogin").hidden=false;el("releaseDashboard").hidden=true;msg(text,true);
 }
 async function request(action,payload={},endpoint=api){
  const {data,error}=await auth.getSession();
  if(error||!data?.session?.access_token)throw Error("관리자 세션이 만료되었습니다.");
  const response=await fetch(endpoint,{method:"POST",cache:"no-store",headers:{
   "Authorization":"Bearer "+data.session.access_token,"apikey":SUPABASE_PUBLISHABLE_KEY,
   "Content-Type":"application/json"},body:JSON.stringify({action,...payload})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok){
   const messages={
    release_in_progress:"다른 배포가 진행 중입니다. 완료 후 다시 시도하세요.",
    version_already_exists:"이미 사용한 버전명 또는 동일한 코드입니다. 새 버전명과 새로운 변경사항이 필요합니다.",
    version_not_found:"선택한 버전을 찾지 못했습니다. 새로고침하세요.",
    no_changes_since_last_version:"최신 버전을 만든 뒤 새 코드 변경사항이 없습니다.",
    release_history_diverged:"최신 코드와 이전 버전의 기록이 달라 수동 점검이 필요합니다.",
    new_changes_detected:"다른 ChatGPT 작업이 추가되었습니다. 목록을 다시 확인한 뒤 버전을 생성하세요.",
    release_bootstrap_pending:"최초 배포 설정을 확인한 뒤 다시 시도하세요.",
    staging_required:"이 버전은 시험 웹 배포 기록이 없습니다. 먼저 시험 웹에 적용하세요.",
    already_on_staging:"이미 시험 웹에 적용된 버전입니다.",
    already_on_production:"이미 실제 웹에 적용된 버전입니다.",
    no_staging_rollback:"되돌릴 이전 시험 버전이 없습니다.",
    no_production_rollback:"되돌릴 이전 실제 웹 버전이 없습니다.",
    admin_mfa_required:"최고 관리자 2단계 인증이 필요합니다.",
    github_unavailable:"GitHub 최신 코드를 조회할 수 없습니다.",
    catalog_unavailable:"버전 목록을 읽을 수 없습니다. 데이터베이스 설치 상태를 확인하세요.",
    release_service_unavailable:"배포 서버가 응답하지 않습니다.",
    invalid_release_metadata:"버전명 또는 수정 내용 형식을 확인하세요.",
    test_confirmation_required:"시험 웹 확인 후 운영 적용을 승인해야 합니다."
   };
   throw Error(messages[result.error]||"요청 실패 ("+(result.error||response.status)+")");
  }
  return result;
 }
 function addText(parent,tag,text,className){
  const node=document.createElement(tag);
  node.textContent=text;
  if(className)node.className=className;
  parent.append(node);return node;
 }
 function renderHistory(id,rows){
  const root=el(id);root.replaceChildren();
  if(!rows?.length){addText(root,"p","아직 배포 기록이 없습니다.","subtle");return;}
  for(const item of rows){
   const wrap=document.createElement("article");wrap.className="release-history-item";
   addText(wrap,"strong",item.version+" · "+(
    item.action.includes("rollback")?"이전 버전으로 복원":
    item.action==="bootstrap"?"최초 설치":
    item.action==="data_refresh"?"학교 목록 자동 갱신":"업데이트 적용"));
   addText(wrap,"div",date(item.deployed_at),"subtle");
   addText(wrap,"p",item.summary||"변경 내용 없음");
   addText(wrap,"code",short(item.from_sha)+" → "+short(item.to_sha));
   root.append(wrap);
  }
 }
 function renderWorkInProgress(){
  const root=el("releaseOpenPullRequests");root.replaceChildren();
  const merged=el("releaseRecentlyMergedPullRequests");merged.replaceChildren();
  const status=el("releaseGitHubWorkStatus");
  if(!workInbox||workInbox.status==="not_checked"){
   status.textContent="GitHub 작업 목록을 아직 조회하지 않았습니다.";return;
  }
  if(workInbox.status==="error"){
   status.textContent="GitHub PR 조회 실패 · 빈 작업함으로 간주하지 않습니다. 새로고침하여 재검사하세요.";
   return;
  }
  const partial=workInbox.status==="partial";
  status.textContent="GitHub PR "+(workInbox.total_seen||0)+"개 확인 · 진행 중 "+
   (workInbox.open_count||0)+"개 · main 병합 이력 "+(workInbox.merged_to_main_count||0)+"개"+
   (partial?" · 일부 자료만 확인됨(조회 누락 가능)":"");
  if(!workInProgress.length)addText(root,"p",
    partial?"일부 조회만 성공했습니다. 작업이 없다고 단정할 수 없습니다.":"열린 PR이 없습니다.","subtle");
  for(const pr of workInProgress){
   const item=document.createElement("article");item.className="release-pending-item";
   const link=document.createElement("a");link.href=pr.url;
   link.target="_blank";link.rel="noopener noreferrer";link.className="release-pr-link";
   link.textContent="#"+pr.number+" · "+pr.title;
   item.append(link);
   addText(item,"span",pr.status==="draft"?"개발 중":"병합 대기","release-pr-status");
   addText(item,"div","대상 "+(pr.base_ref||"확인 불가")+" · SHA "+short(pr.head_sha)+
    " · 수정 "+date(pr.updated_at),"subtle");
   root.append(item);
  }
  const mergedPrs=Array.isArray(workInbox.recently_merged)?workInbox.recently_merged:[];
  if(!mergedPrs.length)addText(merged,"p",
   partial?"일부 조회만 성공했습니다. 병합 작업이 없다고 단정할 수 없습니다.":"최근 main 병합 PR이 없습니다.","subtle");
  for(const pr of mergedPrs){
   const item=document.createElement("article");item.className="release-pending-item";
   const link=document.createElement("a");link.href=pr.url;
   link.target="_blank";link.rel="noopener noreferrer";link.className="release-pr-link";
   link.textContent="#"+pr.number+" · "+pr.title;
   item.append(link);
   addText(item,"span","main 병합 · 버전 포함 여부 별도 확인","release-pr-status");
   addText(item,"div","병합 "+date(pr.merged_at)+" · 코드 "+short(pr.merge_sha||pr.head_sha),"subtle");
   merged.append(item);
  }
 }
 function renderPending(){
  const root=el("releasePendingLog");root.replaceChildren();
  const files=el("releasePendingFileNames");files.replaceChildren();
  const status=el("releasePendingStatus");
  if(!pending){
   status.textContent=commitScanError?
    "GitHub 커밋 비교 실패 · 새 작업이 없다고 판단할 수 없습니다.("+commitScanError+")":
    "현재 확인된 신규 main 커밋은 없습니다. 병합 PR은 별도 표시되며 버전에 포함된 것은 아닙니다.";
   el("releasePendingFiles").hidden=true;return;
  }
  const changes=pending.commits||[];
  status.textContent="새 작업 "+changes.length+"개 · 변경 파일 "+(pending.files||[]).length+
   "개 · 기준 코드 "+short(pending.base_sha)+" → 최신 코드 "+short(pending.head_sha);
  for(const commit of changes){
   const article=document.createElement("article");article.className="release-pending-item";
   addText(article,"strong",commit.message||"작업 내용 미기재");
   addText(article,"code",commit.sha);
   root.append(article);
  }
  if(!changes.length)addText(root,"p","변경 파일은 있지만 표시할 작업 메시지는 없습니다.","subtle");
  for(const f of pending.files||[])addText(files,"li",f);
  el("releasePendingFiles").hidden=!(pending.files||[]).length;
 }
 function renderCatalog(){
  const root=el("releaseVersionCatalog");root.replaceChildren();
  if(!versions.length){addText(root,"p","아직 생성한 버전이 없습니다.","subtle");return;}
  for(const v of versions){
   const article=document.createElement("article");article.className="release-catalog-item";
   addText(article,"strong",v.version+" · "+(v.summary||"업데이트"));
   const flags=[v.on_production?"실제 웹 적용":null,
    v.on_staging?"시험 웹 적용":null,v.tested?"시험 이력 있음":null]
    .filter(Boolean).join(" · ")||"배포 대기";
   addText(article,"div",date(v.created_at)+" · 코드 "+short(v.sha)+" · "+flags,"subtle");
   addText(article,"p","변경 파일 "+(v.changed_count||0)+"개");
   if(Array.isArray(v.changes)&&v.changes.length)
    addText(article,"p",v.changes.map(c=>c.message).filter(Boolean).slice(-6).join(" / "),"release-catalog-changes");
   root.append(article);
  }
 }
 function fillSelect(id,items,current){
  const select=el(id);
  const prior=select.value;
  select.replaceChildren();
  const placeholder=document.createElement("option");placeholder.value="";
  placeholder.textContent=id==="releaseProdSelect"?"시험 웹에 적용한 버전 선택":"생성된 버전 선택";
  select.append(placeholder);
  for(const item of items){
   const opt=document.createElement("option");opt.value=item.id;
   opt.textContent=item.version+" · "+(item.summary||"업데이트").slice(0,48)+
    (item.sha===current?" (현재 적용)":"");
   select.append(opt);
  }
  if(items.some(v=>v.id===prior))select.value=prior;
  else select.value="";
  select.disabled=busy||!!model?.job||!items.length;
 }
 function updateControls(){
  if(!model)return;
  const s=model.state||{},job=!!model.job;
  const staging=versions.find(v=>v.id===el("releaseStageSelect").value);
  const production=versions.find(v=>v.id===el("releaseProdSelect").value);
  el("releaseStageApply").disabled=busy||job||!staging||staging.sha===s.staging_sha||!s.production_sha;
  el("releaseProdApply").disabled=busy||job||!production||!production.tested||
   production.sha===s.production_sha;
  const stageH=model.staging_history||[],prodH=model.production_history||[];
  el("releaseStageRollback").disabled=busy||job||!stageH.length||
   stageH[0].from_sha===s.staging_sha;
  const lastCodeRelease=prodH.find(h=>h.action!=="data_refresh");
  el("releaseProdRollback").disabled=busy||job||!lastCodeRelease||
   !lastCodeRelease.from_sha||lastCodeRelease.from_sha===s.production_sha;
  el("releaseRegister").disabled=busy||job||!pending||!(pending.files||[]).length;
  el("releaseRefresh").disabled=busy;
 }
 function render(data,checked=false){
  model=data;versions=data.versions||[];
  const s=data.state||{},job=data.job;
  if(checked){
   latestHead=data.head_sha||null;
   recentSuggestion=data.suggested_draft||null;
   pending=data.pending||null;
   workInbox=data.work_inbox||null;
   workInProgress=workInbox?.open||data.work_in_progress||[];
   commitScanError=data.commit_scan_error||null;
   if(recentSuggestion){
    if(!el("releaseVersionInput").dataset.edited)
     el("releaseVersionInput").value=recentSuggestion.version;
    if(!el("releaseSummaryInput").dataset.edited)
     el("releaseSummaryInput").value=recentSuggestion.summary;
   }
  }
  el("releaseHead").textContent=latestHead?
    "GitHub 최신 코드: "+short(latestHead):"상태 새로고침으로 GitHub 최신 코드를 확인하세요.";
  el("releaseStageVersion").textContent=s.staging_sha?(s.staging_version||"버전 미입력"):"아직 시험 웹 미배포";
  el("releaseProdVersion").textContent=s.production_sha?(s.production_version||"버전 미입력"):"최초 배포 준비 중";
  el("releaseStageSha").textContent=s.staging_sha?"코드 "+short(s.staging_sha):"시험 웹 업데이트 기록 없음";
  el("releaseProdSha").textContent=s.production_sha?"코드 "+short(s.production_sha):"운영 버전 확인 중";
  el("releaseDraftInfo").textContent=pending?
   "현재 "+(pending.files||[]).length+"개 파일의 변경사항을 새 버전으로 묶을 수 있습니다.":
   "새 작업이 생기면 버전 생성이 활성화됩니다.";
  el("releaseQueueText").textContent=job?
   ((job.status==="running"?"배포 중":"배포 대기")+" · "+job.version+
    " · "+(job.target==="staging"?"시험 웹":"실제 웹")+
    " · 요청 시각 "+date(job.created_at)):
   "현재 진행 중인 배포가 없습니다.";
  renderWorkInProgress();renderPending();renderCatalog();
  renderHistory("releaseStageHistory",data.staging_history||[]);
  renderHistory("releaseProdHistory",data.production_history||[]);
  fillSelect("releaseStageSelect",versions,s.staging_sha);
  fillSelect("releaseProdSelect",versions.filter(v=>v.tested),s.production_sha);
  updateControls();
 }
 async function refresh(quiet=false){
  if(busy)return;
  try{
   const data=await request("status",{check_latest:!quiet});
   el("releaseDashboard").hidden=false;el("releaseLogin").hidden=true;
   render(data,!quiet);
   if(!quiet)msg("버전 목록과 자동 수집 작업을 최신 상태로 확인했습니다.");
  }catch(err){if(!quiet)msg("업데이트 조회 실패: "+(err.message||String(err)),true);}
 }
 async function command(action){
  if(busy||!model)return;
  const selected=action==="stage_apply"?
   versions.find(v=>v.id===el("releaseStageSelect").value):
   action==="prod_apply"?versions.find(v=>v.id===el("releaseProdSelect").value):null;
  if(["stage_apply","prod_apply"].includes(action)&&!selected){
   msg("적용할 버전을 드롭다운에서 선택하세요.",true);return;
  }
  const wording={
   stage_apply:"시험 웹에 "+(selected?.version||"")+" 버전을 적용하시겠습니까?",
   stage_rollback:"시험 웹을 이전 버전으로 되돌리시겠습니까?",
   prod_apply:"시험 웹에서 직접 검증했습니까? "+(selected?.version||"")+" 버전을 실제 웹에 배포합니다.",
   prod_rollback:"실제 웹을 이전 버전으로 되돌리시겠습니까? 모든 방문자에게 적용됩니다."
  };
  if(!window.confirm(wording[action]))return;
  const payload=selected?{version_id:selected.id,...(action==="prod_apply"?{confirmed_tested:true}:{})}:{};
  busy=true;updateControls();
  try{
   const result=await request(action,payload);
   msg("배포 요청 등록 완료 ("+String(result.job_id||"").slice(0,8)+"). 실제 게시가 끝나면 버전 기록에 반영됩니다.");
  }catch(err){msg(err.message,true)}
  finally{busy=false;await refresh(true);}
 }
 async function createVersion(event){
  event.preventDefault();if(busy||!pending)return;
  const version=el("releaseVersionInput").value.trim();
  const summary=el("releaseSummaryInput").value.trim();
  if(!version||summary.length<3)return;
  if(!window.confirm(version+" 버전을 생성할까요? 이 버전은 이후 수정해도 코드가 바뀌지 않습니다."))return;
  busy=true;updateControls();msg("GitHub 최신 코드의 변경 내용을 버전으로 저장 중입니다.");
  let newId="";
  try{
   const result=await request("create_version",{version,summary,expected_sha:pending.head_sha});
   newId=result.release?.id||"";
   msg("버전 "+version+" 생성 완료 · 변경 파일 "+result.changed_count+"개. 드롭다운에서 선택해 시험 웹에 적용하세요.");
   delete el("releaseVersionInput").dataset.edited;
   delete el("releaseSummaryInput").dataset.edited;
  }catch(err){msg(err.message,true)}
  finally{
   busy=false;await refresh(false);
   if(newId){el("releaseStageSelect").value=newId;updateControls();}
  }
 }
 el("releaseDraftForm").addEventListener("submit",createVersion);
 for(const id of ["releaseVersionInput","releaseSummaryInput"]){
  el(id).addEventListener("input",()=>{el(id).dataset.edited="1";});
 }
 for(const id of ["releaseStageSelect","releaseProdSelect"])
  el(id).addEventListener("change",updateControls);
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
   await refresh(false);
   // Read cached admin DB state frequently but GitHub only every 5 minutes.
   // This avoids exhausting GitHub's unauthenticated REST rate limits.
   let refreshTick=0;
   timer=setInterval(()=>{
    if(!document.hidden){refreshTick++;
     void refresh(refreshTick%20!==0);
    }
   },15000);
  }catch(err){denied("관리자 인증 필요: "+err.message);}
 })();
 window.addEventListener("pagehide",()=>{if(timer)clearInterval(timer);});
})();