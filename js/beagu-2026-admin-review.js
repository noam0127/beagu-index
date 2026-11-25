/* School-year 2026 private review queue. It never approves publication.
 * This module is mounted only after existing admin Auth + TOTP verification.
 */
(()=>{
 "use strict";
 const $=id=>document.getElementById(id);
 let role="",page=0,filter="quality",seq=0,ready=false,pipelineSeq=0;
 const endpoint=SUPABASE_URL+"/functions/v1/beagu-2026-review-admin";
 const labels={
  TECHNICAL_CHECK_PASSED:"전체 문항 기술검사 통과",
  NEEDS_QUESTION_CHECK:"전체 문항 구조 확인 필요",
  NEEDS_SCHOOL_CHECK:"학교 정보 일치 확인 필요",
  PRELAUNCH_EXCLUDED:"사전조사 제외",NOT_CHECKED:"전체 문항 기술검사 미완료"
 };
 const qualityReasonsMap={
  SCHOOL_MATCH_UNRESOLVED:"학교 정보 일치 확인 필요",
  MANDATORY_QUESTION_COVERAGE:"필수 문항 집계 건수 확인 필요",
  UNRECOGNIZED_MANDATORY_ANSWER:"필수 문항 보기값 해석 확인 필요",
  QUALITY_SCAN_PENDING:"기초 집계 검사 미실행"
 };
 const technicalReasons={
  QA_NOT_AVAILABLE:"전체 문항 기술검사 미실행",
  MISSING_QA_EVIDENCE:"문항별 검증 근거 확인 필요",
  QUESTION_MISMATCH:"문항 구조 불일치"
 };
 const build=(tag,cls,text)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(text!==undefined)el.textContent=String(text);
  return el;
 };
 const notice=txt=>{$("adminReview2026Status").textContent=txt;};
 async function call(data){
  const {data:auth,error}=await supabaseClient.auth.getSession();
  if(error||!auth?.session?.access_token)throw Error("admin_session_missing");
  const res=await fetch(endpoint,{
    method:"POST",cache:"no-store",
    headers:{
      "Authorization":"Bearer "+auth.session.access_token,
      "apikey":SUPABASE_PUBLISHABLE_KEY,
      "Content-Type":"application/json"
    },body:JSON.stringify(data)
  });
  const result=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(result?.error||"review_api_error");
  return result;
 }
 const setCount=(id,value)=>{
   const el=$(id);if(el)el.textContent=value===null||value===undefined?"—":String(value);
 };
 // Waterway uses strict non-negative integer counts, never null -> zero.
 const knownCount=value=>Number.isSafeInteger(value)&&value>=0?value:null;
 const countText=value=>knownCount(value)===null?"미확인":value.toLocaleString("ko-KR");
 const put=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
 const preflightLabels={
   PUBLICATION_RESTRICTED:"공개 제한 · 신고 보류 또는 근거 반려",
   TECHNICAL_REVIEW_REQUIRED:"학교매칭·응답·문항 기술검사 추가 확인",
   BASIS_MISSING:"공개 근거 미등록",
   BASIS_STALE:"변경된 집계에 대한 공개 근거 재검증",
   BASIS_REVIEW_REQUIRED:"동의·재식별·소표본 등 추가 검토",
   BASIS_VERIFIED_AWAITING_APPROVAL:"근거 확인 · 학교별 승인 대기",
   APPROVAL_RECORDED_CURRENT:"현재 근거와 일치하는 학교별 승인"
 };
 function renderWaterway(data){
   const d=data?.version===1?data:null;
   const source=d?.source||{},sync=d?.sync||{},agg=d?.aggregate||{};
   const pre=d?.preflight||{},total=knownCount(d?.preflight_total);
   const preValid=total!==null&&Object.keys(pre).every(k=>Object.hasOwn(preflightLabels,k)&&knownCount(pre[k])!==null)
     &&Object.values(pre).reduce((sum,n)=>sum+n,0)===total;
   const getReason=k=>preValid?(pre[k]??0):null;
   const basisA=getReason("BASIS_VERIFIED_AWAITING_APPROVAL"),basisB=getReason("APPROVAL_RECORDED_CURRENT");
   put("adminWaterwayRaw",countText(source.live_raw_rows));
   put("adminWaterwaySync",countText(sync.source_rows));
   put("adminWaterwayMatched",countText(sync.matched_rows));
   put("adminWaterwayValid",countText(agg.individual_valid_rows));
   put("adminWaterwayAggregated",countText(agg.rows));
   put("adminWaterwayBasis",countText(basisA===null||basisB===null?null:basisA+basisB));
   put("adminWaterwayApproved",countText(basisB));
   put("adminWaterwaySourceNote",d?"최근 서버 수신 본조사 "+countText(source.last_observed_official_rows)+"건 · "+formatDate(source.last_observed_at)+(source.live_raw_status==="SOURCE_NOT_CONNECTED"?" · 원본 직접연결 미확인":" · 원본 관측 "+formatDate(source.raw_observed_at)):"원본 연결 확인 불가");
   const syncLabels={NO_SNAPSHOT:"전송 기록 없음",NEWER_COUNT_DIFFERS:"최근 응답 수신 기록과 집계 기준 수치가 다름",SNAPSHOT_STALE:"마지막 집계 26시간 초과",SNAPSHOT_RECORDED:"집계 기록 확인"};
   put("adminWaterwaySyncNote",d?(syncLabels[sync.status]||"전송 상태 미확인")+" · "+formatDate(sync.snapshot_at):"전송 기록 확인 불가");
   put("adminWaterwayMatchNote",d?"미매칭 "+countText(sync.unmatched_rows)+"건 · 사전조사 "+countText(sync.prelaunch_rows)+"건 · 날짜 확인 "+countText(sync.undated_rows)+"건":"매칭 기록 확인 불가");
   put("adminWaterwayValidityNote",d?"기초 검수 표시 응답 "+countText(agg.basic_review_rows)+"건 · "+formatDate(agg.basic_review_at)+" · 전체 유효성 확정 아님":"응답 검수 기록 확인 불가");
   put("adminWaterwayAggregateNote",d?countText(agg.schools)+"개교 · "+formatDate(agg.snapshot_at)+(agg.same_snapshot===true?" · 동기화 시점 일치":" · 동기화 시점 일치 미확인"):"집계 기록 확인 불가");
   put("adminWaterwayBasisNote",preValid?"증빙 미등록 "+countText(getReason("BASIS_MISSING"))+"개교 · 기술 확인 "+countText(getReason("TECHNICAL_REVIEW_REQUIRED"))+"개교":"공개 사전검사 확인 불가");
   put("adminWaterwayStatus",d?"진단 시각 "+formatDate(d.checked_at)+" · 각 단계의 단위와 기준 시각을 구분합니다.":"공개 흐름 상세 진단을 가져오지 못했습니다. 관리자 인증 및 서버 연결을 확인하세요.");
   put("adminWaterwayFailure",d?"마지막 실패 시각: "+(sync.last_failure_at?formatDate(sync.last_failure_at):"미확인")+" · 원인: "+(typeof sync.last_failure_reason==="string"&&sync.last_failure_reason?sync.last_failure_reason:"Apps Script 실행 기록 미연결 (실패 없음으로 해석하지 않음)"):"마지막 실패 시각 및 원인: 미확인");
   const stageList=$("adminWaterwayRunStages");
   if(stageList){
     stageList.replaceChildren();
     const names={SOURCE:"원본·학교정보",QUESTION_RESULTS:"문항 집계·전송",CORE_AND_QA:"핵심 집계·검수 전송",SCHOOL_CULTURE:"학교문화 집계"};
     const states={SUCCESS:"성공",ERROR:"실패",SKIPPED:"미실행"};
     const reasons={NONE:"",AUTH_CONFIG:"인증 설정",HTTP_401:"인증 실패",HTTP_403:"접근 제한",HTTP_409:"스냅샷 충돌",HTTP_429:"요청 제한",HTTP_5XX:"서버 오류",HTTP_OTHER:"HTTP 오류",SOURCE_OR_SCHEMA:"원본·문항·학교정보 확인",LOCK_BUSY:"다른 집계 실행 중",PARTIAL_SYNC:"일부 전송 실패",STAGE_ERROR:"단계 오류",NOT_INSTALLED:"미실행"};
     if(!Array.isArray(d?.run?.stages))stageList.append(build("li","","실행 기록 미수신"));
     else for(const s of d.run.stages){
       if(!Object.hasOwn(names,s.stage)||!Object.hasOwn(states,s.status)||!Object.hasOwn(reasons,s.reason))continue;
       stageList.append(build("li","",names[s.stage]+" · "+states[s.status]+(reasons[s.reason]?" · "+reasons[s.reason]:"")+" · "+countText(s.duration_ms)+"ms"));
     }
   }
   put("adminWaterwayRunAt",d?.run?.finished_at?"최근 실행 종료 "+formatDate(d.run.finished_at):"최근 실행 기록 미수신");
   const list=$("adminWaterwayReasons");
   if(list){
     list.replaceChildren();
     if(!preValid)list.append(build("li","","사전검사 결과 확인 불가"));
     else for(const [key,label] of Object.entries(preflightLabels))list.append(build("li","",label+" · "+countText(getReason(key))+"개교"));
   }
 }
 const renderPipeline=payload=>{
   const response=payload?.response_trust||{};
   const aggregate=payload?.aggregation_accuracy||{};
   const publication=payload?.publication_eligibility||{};
   setCount("adminPipelineReferralEvents",response.referral_events);
   setCount("adminPipelineReferralPending",response.referral_review_required);
   setCount("adminPipelineAggregateAuto",aggregate.basic_auto_pass);
   setCount("adminPipelineAggregateReview",aggregate.basic_review_required);
   setCount("adminPipelineTechnicalPass",aggregate.full_technical_pass);
   setCount("adminPipelineBasis",publication.basis_verified);
   setCount("adminPipelineApproved",publication.approved);
   setCount("adminPipelineSingle",publication.single_response_schools);
   setCount("adminPipelineSingleTechnical",publication.single_technical_pass);
   setCount("adminPipelineSingleReview",publication.single_technical_review_needed);
   if($("adminPipelineTrustStatus"))
     $("adminPipelineTrustStatus").textContent=
       response.scope==="REFERRAL_ONLY"?"추천 연결 응답만 부분 검사":"검사 범위 확인 필요";
   if($("adminPipelinePublicationStatus"))
     $("adminPipelinePublicationStatus").textContent=
       Number(publication.approved)>0?"일부 자료 승인됨":"공개 적격성 확인 중 · 자동 공개 안 함";
   const when=aggregate.snapshot_at?formatDate(aggregate.snapshot_at):"미확인";
   $("adminPipelineStatus").textContent="비공개 운영 데이터 기준 · 최신 집계 "+when+
     " · 기초 정합성 통과와 개별 응답 신뢰성·공개 승인은 서로 다른 판단입니다.";
 };
 async function refreshPipeline(){
   if(!ready)return;
   const token=++pipelineSeq;
   if($("adminPipelineStatus"))$("adminPipelineStatus").textContent="3단계 운영 상태를 확인 중입니다.";
   try{
     const data=await call({action:"pipeline"});
     if(token!==pipelineSeq||!ready)return;
     if(!data?.status||data.status.year!==2026)throw Error("unexpected_status");
     renderPipeline(data.status);
     const diagnostic=data.waterway_status==="OK"?data.waterway:null;
     renderWaterway(diagnostic);
     // Use the release status read in the same database statement as the
     // diagnostic counts; retain the existing RPC as rollout fallback.
     renderLevelApprovals(diagnostic?.version===1&&Array.isArray(diagnostic.release)&&diagnostic.release.length===3?diagnostic.release:data.levels);
   }catch{
     if(token!==pipelineSeq||!ready)return;
     renderWaterway(null);
     renderLevelApprovals([]);
     if($("adminPipelineStatus"))$("adminPipelineStatus").textContent=
       "단계별 수치를 가져오지 못했습니다. 관리자 세션과 서버 업데이트 상태를 확인하세요.";
   }
 }
 const formatDate=v=>{
  if(!v)return "없음";
  const date=new Date(v);
  if(!Number.isFinite(date.getTime()))return "시간 미확인";
  return date.toLocaleString("ko-KR",{timeZone:"Asia/Seoul",hour12:false});
 };
 function render(data){
  $("adminReview2026Total").textContent=String(data.summary?.total??"—");
  $("adminReview2026Technical").textContent=String(data.summary?.technical??"—");
  $("adminReview2026Approved").textContent=String(data.summary?.approved??"—");
  const root=$("adminReview2026List");root.replaceChildren();
  const rows=Array.isArray(data.items)?data.items:[];
  if(!rows.length)root.append(build("p","empty","현재 선택된 조건에 해당하는 학교가 없습니다."));
  for(const item of rows){
    const row=build("article","ranking-card");
    const headline=build("div","rank-line");
    headline.append(
      build("strong","rank-school",item.school_name||item.school_id),
      build("span","pill",labels[item.technical_status]||item.technical_status||"검수 없음"),
      build("span","pill",item.approval_status==="APPROVED"?"승인됨":"공개 보류"));
    const detail=build("p","subtle",
      [item.region,item.office,item.school_id].filter(Boolean).join(" · ")+
      " · 관리자 전용 원본 응답행 "+String(item.private_response_rows??"미확인")+
      " · 자료갱신 "+formatDate(item.updated_at));
    row.append(headline,detail);
    const qualityReasons=Array.isArray(item.quality_reasons)?item.quality_reasons:[];
    row.append(build("p","subtle","집계 정확성 · 기초 정합성: "+(
      item.quality_status==="AUTO_PASS"?"자동 통과 · 공개 승인과 별개":
      item.quality_status==="REVIEW_REQUIRED"?"관리자 추가 확인 필요":"자동 검사 대기")));
    if(item.quality_status==="REVIEW_REQUIRED"&&qualityReasons.length)
      row.append(build("p","subtle","기초 집계 확인 항목: "+qualityReasons.map(v=>qualityReasonsMap[v]||v).join(", ")));
    const reasons=Array.isArray(item.review_reasons)?item.review_reasons:[];
    if(reasons.length)row.append(build("p","subtle","전체 문항 기술검사 항목: "+reasons.map(v=>technicalReasons[v]||v).join(", ")));
    if(item.last_decision)row.append(build("p","subtle","최근 심사 결정: "+item.last_decision));
    const basisLabel={
      NOT_REVIEWED:"근거 미검토",PENDING:"근거 확인 중",REJECTED:"공개 근거 반려",VERIFIED:"별도 검증 완료"
    }[item.basis_review_status]||"근거 상태 미확인";
    row.append(build("p","subtle","공개 적격성 · 근거: "+basisLabel+
      (item.basis_reviewed_at?" · 검토일 "+formatDate(item.basis_reviewed_at):"")));
    if(role==="owner")row.append(makeBasisForm(item));
    if(role==="owner"&&item.approval_status!=="APPROVED")row.append(makeFinalApproveForm(item));

    if(role==="owner" && item.approval_status!=="WITHHELD" || role==="owner" && item.last_decision!=="WITHHELD"){
      const button=build("button","secondary","보류 사유 기록");
      button.type="button";
      button.addEventListener("click",()=>hold(item,button));
      row.append(button);
    }
    root.append(row);
  }
  $("adminReview2026Prev").disabled=page===0;
  $("adminReview2026Next").disabled=rows.length<20;
  $("adminReview2026Page").textContent="페이지 "+(page+1);
  notice("집계 정확성 검사 · 기초 정합성 예외만 기본 표시 · 응답 신뢰성 검사 및 공개 적격성 검사와 구분");
 }
 function makeBasisForm(item){
  const wrap=build("details","beagu-basis-review");
  const heading=build("summary","","근거 검토 기록 · 공개 승인 불가");
  wrap.append(heading);
  const form=build("form","beagu-basis-form");
  const field=(title,name,type,max)=>{
    const label=build("label","",title),input=build(type==="textarea"?"textarea":"input");
    input.name=name;
    if(type!=="textarea")input.type=type;
    if(max)input.maxLength=max;
    input.autocomplete="off";
    label.append(input);form.append(label);return input;
  };
  const typeLabel=build("label","","검토 중인 공개 근거 유형");
  const basisType=build("select");basisType.name="basis_type";
  for(const [value,label] of [
    ["","확인되지 않음"],["EXPLICIT_RESPONDENT_CONSENT","응답자의 명시적 동의"],
    ["OTHER_DOCUMENTED_LEGAL_BASIS","기타 문서화한 적법한 근거"]
  ]){
    const opt=build("option","",label);opt.value=value;basisType.append(opt);
  }
  typeLabel.append(basisType);form.append(typeLabel);
  field("원본 고지·동의 자료의 안전한 참조 링크/문서 ID (선택)","notice_source_ref","text",400);
  field("자료 SHA-256 해시, 소문자 64자리 (선택)","notice_digest_sha256","text",64);
  const when=field("실제 고지 효력일 · 원본으로 확인한 경우에만 입력 (선택)","notice_effective_at","date");
  when.max="2099-12-31";
  field("해당 고지에서 허용한 공개 범위 (선택)","publication_scope","textarea",500);
  const notes=field("검토 내용·보류 이유 (필수, 개인정보 입력 금지)","notes","textarea",500);
  notes.required=true;notes.minLength=12;
  const checklist=[
    ["distinct_respondents_reviewed","고유 응답자·중복 검수 완료"],
    ["personal_data_reviewed","개인정보 및 민감 문항 검수 완료"],
    ["small_sample_reviewed","소표본 위험 검수 완료"],
    ["reidentification_reviewed","학교별 재식별 위험 검수 완료"],
    ["prior_data_combination_reviewed","과거 자료 결합·차분 공격 검수 완료"]
  ];
  for(const [name,title] of checklist){
    const label=build("label","beagu-basis-check"),c=build("input");c.type="checkbox";c.name=name;
    label.append(c,build("span","",title));form.append(label);
  }
  const decisionLabel=build("label","","근거 검토 결정 (공개 승인이 아님)");
  const decision=build("select");decision.name="decision";
  for(const [value,label] of [["PENDING","확인 중 · 계속 비공개"],["REJECTED","반려 · 계속 비공개"]]){
    const option=build("option","",label);option.value=value;decision.append(option);
  }
  decisionLabel.append(decision);form.append(decisionLabel);
  const button=build("button","secondary","비공개 검토 결과 저장");button.type="submit";form.append(button);
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if(!form.reportValidity())return;
    if(!window.confirm("이 학교의 공개 근거를 '"+(decision.value==="REJECTED"?"반려":"확인 중")+
      "'으로 기록합니다. 이 작업은 기존 공개 승인을 철회할 수 있으며 결과를 공개하지 않습니다. 진행할까요?"))return;
    button.disabled=true;
    const value={action:"basis_review",school_id:item.school_id,payload_sha256:item.payload_sha256,
      decision:decision.value,basis_type:basisType.value,
      notice_source_ref:form.elements.namedItem("notice_source_ref").value.trim(),
      notice_digest_sha256:form.elements.namedItem("notice_digest_sha256").value.trim(),
      notice_effective_at:when.value?when.value+"T00:00:00+09:00":null,
      publication_scope:form.elements.namedItem("publication_scope").value.trim(),
      notes:notes.value.trim()};
    for(const [name] of checklist)value[name]=form.elements.namedItem(name).checked;
    try{
      await call(value);
      notice("비공개 근거 검토 기록을 저장했습니다. 공개 승인은 이루어지지 않았습니다.");
      await refresh();
    }catch{
      notice("검토 기록 저장 실패 · 현재 스냅샷과 권한을 다시 확인하세요.");
    }finally{button.disabled=false;}
  });
  wrap.append(form);
  return wrap;
 }

 function makeFinalApproveForm(item){
   const wrap=build("details","beagu-basis-review beagu-final-approve");
   wrap.append(build("summary","","학교별 최종 승인 · 증빙 확인 후 진행"));
   const form=build("form","beagu-basis-form");
   const add=(labelText,name,type,min,max)=>{
     const label=build("label","",labelText);
     const input=build(type==="textarea"?"textarea":"input");
     input.name=name;input.required=true;
     if(type!=="textarea")input.type=type;
     if(min)input.minLength=min;
     if(max)input.maxLength=max;
     label.append(input);form.append(label);return input;
   };
   const label=build("label","","법적 공개 근거");
   const type=build("select");type.name="basis_type";type.required=true;
   for(const [value,name] of [
     ["","선택하세요"],["EXPLICIT_RESPONDENT_CONSENT","응답자 명시적 동의"],
     ["OTHER_DOCUMENTED_LEGAL_BASIS","기타 문서화한 적법한 근거"]
   ]){
     const option=build("option","",name);option.value=value;type.append(option);
   }
   label.append(type);form.append(label);
   add("원본 고지/동의 증빙 문서 참조(12~400자)","notice_source_ref","text",12,400);
   const digest=add("원본 고지 파일의 SHA-256 해시(소문자 64자리)","notice_digest_sha256","text",64,64);
   digest.pattern="[a-f0-9]{64}";
   const effective=add("고지 효력 발생일","notice_effective_at","date");
   effective.max="2099-12-31";
   add("고지로 허용된 자료 공개 범위(20~500자)","publication_scope","textarea",20,500);
   add("공개 승인 사유·검토 결과(12~500자, 개인정보 제외)","notes","textarea",12,500);
   const checks=[
     ["distinct_respondents_reviewed","고유 응답자·중복 검토 완료"],
     ["personal_data_reviewed","개인정보와 민감 문항 검토 완료"],
     ["small_sample_reviewed","소표본 위험 검토 완료"],
     ["reidentification_reviewed","재식별 위험 검토 완료"],
     ["prior_data_combination_reviewed","과거 자료 결합 위험 검토 완료"]
   ];
   for(const [name,description] of checks){
     const row=build("label","beagu-basis-check");
     const checkbox=build("input");checkbox.type="checkbox";checkbox.name=name;checkbox.required=true;
     row.append(checkbox,build("span","",description));form.append(row);
   }
   const fields=[
     ["source_scoring","점수·채점 근거"],["school_identity","학교 매칭 근거"],
     ["duplicate_responses","중복 응답 검토 근거"],["consent","동의·적법성 근거"],
     ["small_sample","소표본 위험 검토 근거"],
     ["reidentification","재식별 위험 검토 근거"],
     ["prior_data_combination","과거 자료 결합 검토 근거"]
   ];
   const evidence=build("details","beagu-evidence-details");
   evidence.append(build("summary","","필수 검토 증빙 7항목 펼치기"));
   const evidenceContent=build("div","beagu-evidence-fields");
   for(const [name,description] of fields){
     const row=build("label","",description);
     const input=build("textarea");input.name=name;input.required=true;
     input.minLength=10;input.maxLength=400;
     row.append(input);evidenceContent.append(row);
   }
   evidence.append(evidenceContent);form.append(evidence);
   const button=build("button","primary","이 학교의 검토 결과를 최종 승인");
   button.type="submit";form.append(button);
   form.addEventListener("submit",async event=>{
     event.preventDefault();
     if(!form.reportValidity()){evidence.open=true;return;}
     if(!window.confirm("이 학교의 검증·동의·재식별 위험 증빙을 직접 확인한 뒤, 현재 2026 자료의 최종 공개를 승인하시겠습니까?"))return;
     button.disabled=true;
     const input={
       action:"finalize",school_id:item.school_id,payload_sha256:item.payload_sha256,
       basis_type:type.value,
       notice_source_ref:form.elements.namedItem("notice_source_ref").value.trim(),
       notice_digest_sha256:digest.value.trim(),
       notice_effective_at:effective.value+"T00:00:00+09:00",
       publication_scope:form.elements.namedItem("publication_scope").value.trim(),
       notes:form.elements.namedItem("notes").value.trim(),
       review_checks:{},evidence:{}
     };
     for(const [name] of checks)input.review_checks[name]=form.elements.namedItem(name).checked;
     for(const [name] of fields)input.evidence[name]=form.elements.namedItem(name).value.trim();
     try{
       const result=await call(input);
       if(result?.ok!==true)throw Error("approval_missing");
       notice("학교별 최종 승인이 기록됐습니다. 레벨별 공개 승인은 별도로 진행해야 합니다.");
       await Promise.all([refresh(),refreshPipeline()]);
     }catch{
       notice("학교별 최종 승인에 실패했습니다. 공개 증빙·고지 효력일·최신 자료·MFA 인증을 확인하세요.");
     }finally{button.disabled=false;}
   });
   wrap.append(form);return wrap;
 }
 async function hold(item,button){
  if(role!=="owner")return;
  const reason=window.prompt("이 학교의 공개를 보류하는 사유를 12~500자로 기록하세요. 개인정보와 원본 설문 응답은 입력하지 마세요.","동의 증빙 또는 재식별 위험 검토 미완료");
  if(reason===null)return;
  if(reason.trim().length<12||reason.trim().length>500||/[<>]/.test(reason)){
    notice("보류 사유는 12~500자로 입력하며 꺾쇠 기호를 사용할 수 없습니다.");return;
  }
  if(!window.confirm("선택한 학교의 현재 자료를 비공개 보류하고 기존 공개 승인이 있다면 철회하겠습니까?"))return;
  button.disabled=true;
  try{
   const result=await call({action:"hold",school_id:item.school_id,
     payload_sha256:item.payload_sha256,reason:reason.trim()});
   if(!result.ok)throw Error("hold_failed");
   notice("보류 결정을 기록했습니다. 감사 기록이 보존됩니다.");
   await refresh();
  }catch{notice("보류를 기록하지 못했습니다. 자료가 변경되었거나 관리자 권한이 없습니다. 다시 조회하세요.");}
  finally{button.disabled=false;}
 }
 async function refresh(){
  if(!ready)return;
  const id=++seq;notice("비공개 검수 목록을 불러오는 중입니다.");
  try{
   const data=await call({action:"queue",filter,page});
   if(id!==seq)return;
   render(data);
  }catch(error){
   if(id!==seq)return;
   notice("검수 목록을 불러오지 못했습니다. 관리자 계정, MFA 인증, 서버 설정을 확인하세요.");
  }
 }
 async function refreshReferralRisks(){
  const card=$("adminReferralRiskCard");
  if(role!=="owner"||!ready){card.hidden=true;return;}
  card.hidden=false;
  const root=$("adminReferralRiskList");
  $("adminReferralRiskStatus").textContent="추천 연결 응답 검토 대기 목록 확인 중";
  try{
    const data=await call({action:"referral_quality_queue"});
    if(!ready||role!=="owner")return;
    $("adminReferralRiskCount").textContent="추가 확인 필요 "+String(data.total??0)+"건";
    root.replaceChildren();
    const items=Array.isArray(data.items)?data.items:[];
    if(!items.length)root.append(build("p","empty","추천 연결 의심 응답이 없습니다."));
    for(const item of items){
      if(!/^[a-f0-9]{64}$/.test(String(item.event_sha256||"")))continue;
      const row=build("article","ranking-card");
      row.append(build("strong","","추천 제출 "+String(item.event_sha256).slice(0,10)+"…"));
      row.append(build("p","subtle","위험 신호: "+
         (Array.isArray(item.signals)?item.signals.join(", "):"품질 증빙 확인 필요")));
      row.append(build("p","subtle","확인 시각 "+formatDate(item.checked_at)+
        (item.linked_to_referrer?" · 추천인 연결됨":" · 추천인 연결 미확인")));
      const buttons=build("div","period-tabs");
      for(const [decision,textLabel] of [["APPROVE","정상 추천으로 인정"],["REJECT","추천 실적 반려"]]){
        const button=build("button","secondary",textLabel);button.type="button";
        button.addEventListener("click",async()=>{
          const msg=window.prompt("검토 사유를 12~500자로 기록하세요. 개인정보나 설문 원문은 입력하지 마세요.");
          if(msg===null)return;
          const reason=msg.trim();
          if(reason.length<12||reason.length>500||/[<>]/.test(reason)){
            $("adminReferralRiskStatus").textContent="검토 사유는 12~500자로 입력해야 합니다.";return;
          }
          if(!window.confirm("추천 실적 "+(decision==="APPROVE"?"정상 인정":"반려")+"을 확정하시겠습니까?"))return;
          button.disabled=true;
          try{
            await call({action:"referral_quality_resolve",event_hash:item.event_sha256,decision,reason});
            await refreshReferralRisks();
            $("adminReferralRiskStatus").textContent="검토 결과가 저장됐습니다.";
          }catch{
            $("adminReferralRiskStatus").textContent="기록에 실패했습니다. 사건의 최신 상태와 관리자 MFA를 확인하세요.";
          }finally{button.disabled=false;}
        });
        buttons.append(button);
      }
      row.append(buttons);root.append(row);
    }
    $("adminReferralRiskStatus").textContent="관리자 검토용 · 추천인에게 구체적인 위험 신호를 공개하지 않음";
  }catch{
    $("adminReferralRiskStatus").textContent="추천 의심 응답 목록을 불러오지 못했습니다.";
  }
 }

 // Separate owner-only workflow; the existing full question and tier decisions remain unchanged.
 let narrowGeneration=0;
 function mountNarrow(){
  const panel=$("adminPercentileV13"),root=$("adminPercentileV13Body");
  if(!panel||!root)return;
  const generation=++narrowGeneration;
  panel.hidden=role!=="owner";
  root.replaceChildren();if(panel.hidden)return;
  const fields=[["technical_reviewed","산식·집계 검증"],["school_identity_reviewed","학교 식별 검증"],["unique_respondents_reviewed","중복 응답 검토"],["personal_data_reviewed","개인정보 검토"],["small_sample_reviewed","소표본 위험 검토"],["reidentification_reviewed","재식별 위험 검토"],["prior_data_combination_reviewed","기존 자료 결합 위험 검토"]];
  const version=build("input","");version.type="text";version.placeholder="자료 버전 (source_version)";version.maxLength=160;
  const note=build("textarea","");note.placeholder="검토 판단 근거 (12~500자, 원문·개인정보 금지)";note.maxLength=500;
  const status=build("p","subtle","실제 확인한 항목만 선택하세요. 이 화면은 백분위만 대상으로 합니다.");status.setAttribute("role","status");
  const list=build("div","audit-list");let offset=0,busy=false,activeVersion="";
  const current=()=>ready&&role==="owner"&&generation===narrowGeneration;
  const label=(text,input)=>{const l=build("label","");l.append(input,document.createTextNode(" "+text));return l;};
  const checkbox=()=>{const el=build("input","");el.type="checkbox";return el;};
  const button=(text,fn)=>{const el=build("button","secondary",text);el.type="button";el.addEventListener("click",()=>void execute(fn));return el;};
  async function execute(fn){if(busy||!current())return;busy=true;try{await fn();}catch{if(current())status.textContent="실패: 서버 설치, 관리자 MFA, 자료 버전 또는 개별 심사 상태를 확인하세요.";}finally{busy=false;}}
  const ver=()=>{const x=version.value.trim();if(x.length<8||x.length>160)throw Error("version");return x;};
  const reason=el=>{const x=el.value.trim();if(x.length<12||x.length>500||/[<>]/.test(x))throw Error("note");return x;};
  const noticeCheck=checkbox(),anonCheck=checkbox();
  const scope=button("공통 공개범위 검토 저장",async()=>{const v=ver();if(!noticeCheck.checked||!anonCheck.checked)throw Error("scope");if(!window.confirm("기존 응답 안내와 익명 공개범위의 호환성을 실제 확인하셨습니까? 공개 승인은 실행하지 않습니다."))return;await call({action:"percentile_v13_scope",source_version:v,decision:"COMPATIBLE",notice_compatible:true,anonymous_scope_reviewed:true,note:reason(note)});if(current())status.textContent="공통 검토 저장 완료 · 공개 승인 아님";});
  const reject=button("공통 공개범위 반려",async()=>{const v=ver();if(!window.confirm("이 자료 버전의 백분위 공개범위를 반려하시겠습니까?"))return;await call({action:"percentile_v13_scope",source_version:v,decision:"INCOMPATIBLE",notice_compatible:false,anonymous_scope_reviewed:false,note:reason(note)});if(current())await load(v,0);});
  async function load(v,off){
   const [data,preview]=await Promise.all([call({action:"percentile_v13_candidates",source_version:v,offset:off}),call({action:"percentile_v13_preview",source_version:v})]);
   if(!current()||ver()!==v)return;
   activeVersion=v;offset=off;list.replaceChildren();
   status.textContent="전체 "+String(data.total??"미확인")+"개교 · 개별 심사 통과 "+String(preview.eligible_for_percentile_only_approval??"미확인")+"개교 · 승인과 별개";
   for(const row of data.items||[]){
    const card=build("article","ranking-card");card.append(build("strong","",row.school_name||row.school_id),build("p","subtle",row.school_id+" · 백분위 "+row.percentile+" · 유효 응답 "+row.valid_observations+"건 · 교원 "+(row.teacher_total??"미확인")+"명 (관리자 전용)"),build("p","subtle",row.review_complete?"개별 심사 통과":"심사 미완료"));
    const checks=fields.map(([key,text])=>[key,checkbox(),text]);
    for(const [key,el,text] of checks)card.append(label(text,el));
    const memo=build("textarea","");memo.placeholder="실제 판단 근거 (12~500자, 개인정보 금지)";memo.maxLength=500;card.append(memo);
    const exact=()=>({source_version:v,school_id:row.school_id,percentile:Number(row.percentile),valid_observations:Number(row.valid_observations)});
    const review=button("개별 검토 저장",async()=>{if(ver()!==v)throw Error("stale");await call({action:"percentile_v13_review",...exact(),checks:Object.fromEntries(checks.map(([key,el])=>[key,el.checked])),note:reason(memo)});if(current())await load(v,off);});card.append(review);
    for(const level of [1,2]){
     const decision=row["decision_lv"+level];
     const decide=(action)=>button("Lv."+level+" 백분위 "+(action==="APPROVE"?"승인":"철회"),async()=>{if(ver()!==v)throw Error("stale");if(!window.confirm((row.school_name||row.school_id)+" Lv."+level+" 백분위만 "+(action==="APPROVE"?"공개 승인":"공개 철회")+"하시겠습니까? 문항 공개 권한은 변경하지 않습니다."))return;await call({action:"percentile_v13_decide",...exact(),level,decision:action,confirmation:action+"_PERCENTILE_ONLY"});if(current())await load(v,off);});
     const approve=decide("APPROVE");approve.disabled=!row.review_complete;card.append(approve);if(decision==="APPROVE")card.append(decide("REVOKE"));
    }
    list.append(card);
   }
   prev.disabled=off===0;next.disabled=off+20>=Number(data.total||0);
  }
  const reload=button("후보 및 심사 상태 조회",()=>load(ver(),0));
  const prev=button("이전",()=>load(ver(),Math.max(0,offset-20))),next=button("다음",()=>load(ver(),offset+20));prev.disabled=next.disabled=true;
  root.append(build("p","subtle","백분위 전용 승인입니다. Lv.1은 24시간 경과 후, Lv.2는 승인 후 표시됩니다. Lv.0과 설문 문항은 변경하지 않습니다."),label("자료 버전",version),label("기존 응답 안내와 호환됨",noticeCheck),label("익명 공개범위를 확인함",anonCheck),note,scope,reject,reload,status,list,prev,next);
 }

 function mount(adminRole){
  role=adminRole==="owner"?"owner":"viewer";
  ready=true;page=0;filter="quality";
  mountNarrow();
  $("adminReview2026Filter").value=filter;
  void refresh();
  void refreshPipeline();
  if(role==="owner"){void refreshReferralRisks();void previewBulk();}
 }
 function reset(){
  ready=false;role="";seq++;page=0;pipelineSeq++;narrowGeneration++;
  if($("adminPercentileV13"))$("adminPercentileV13").hidden=true;
  $("adminPercentileV13Body")?.replaceChildren();
  renderWaterway(null);
  renderLevelApprovals([]);
  bulkCandidates=0;
  $("adminBulkApprovalApply").disabled=true;
  $("adminBulkApprovalApply").textContent="검증 완료 학교 다량 최종승인";
  $("adminBulkApprovalCount").textContent="—";
  $("adminBulkApprovalStatus").textContent="관리자 MFA 인증 후 승인 대상을 확인하세요.";
  $("adminReferralRiskCard").hidden=true;
  $("adminReferralRiskList").replaceChildren();
  $("adminReview2026List").replaceChildren();
  $("adminReview2026Total").textContent="—";
  $("adminReview2026Technical").textContent="—";
  $("adminReview2026Approved").textContent="—";
  notice("관리자 인증 후 집계 정확성 검수 목록을 불러옵니다.");
  if($("adminPipelineStatus"))$("adminPipelineStatus").textContent="관리자 인증 후 단계별 상태를 확인합니다.";
 }
 $("adminReview2026Filter").addEventListener("change",event=>{
  filter=event.target.value;page=0;void refresh();
 });
 $("adminReview2026Reload").addEventListener("click",()=>{void refresh();void refreshPipeline();});
 $("adminReferralRiskReload").addEventListener("click",()=>{void refreshReferralRisks();});
 $("adminReview2026Prev").addEventListener("click",()=>{if(page>0){page--;void refresh();}});
 $("adminReview2026Next").addEventListener("click",()=>{page++;void refresh();});

 let bulkCandidates=0;
 async function previewBulk(){
  if(role!=="owner"||!ready)return;
  const btn=$("adminBulkApprovalPreview"),apply=$("adminBulkApprovalApply");
  btn.disabled=true;apply.disabled=true;
  $("adminBulkApprovalStatus").textContent="승인 가능 학교를 서버에서 확인 중입니다.";
  try{
   const data=await call({action:"bulk_verified",preview:true,limit:400});
   if(!data.ok||!data.preview)throw Error("preview_missing");
   bulkCandidates=Math.max(0,Number(data.batch_candidates)||0);
   $("adminBulkApprovalCount").textContent=bulkCandidates.toLocaleString("ko-KR");
   apply.disabled=false;
   apply.textContent="검증 완료 학교 다량 최종승인 ("+bulkCandidates+"개교)";
   $("adminBulkApprovalStatus").textContent=bulkCandidates===0?
    "현재 최종승인 가능한 학교 0개교. 개별 공개 근거 검증 기록이 완료되어야 합니다.":
    "검증 완료된 "+bulkCandidates+"개교에 대해 일괄승인할 수 있습니다.";
  }catch{
   bulkCandidates=0;$("adminBulkApprovalCount").textContent="—";
   $("adminBulkApprovalStatus").textContent="승인 대상 확인 실패 · 관리자 MFA와 서버 상태를 확인하세요.";
  }finally{btn.disabled=false;}
 }
 async function applyBulk(){
  if(role!=="owner"||!ready)return;
  if(bulkCandidates===0){
   await previewBulk();
   if(bulkCandidates===0){
    $("adminBulkApprovalStatus").textContent="실행 가능한 검증 완료 학교가 0개교입니다. 공개 근거 검증(VERIFIED) 완료 후 승인할 수 있습니다.";
    return;
   }
  }
  if(!window.confirm("독립적으로 공개 근거·재식별 검토를 마쳐 VERIFIED로 기록된 학교만 최대 400개교 최종승인합니다. 서버에서 학교별 조건을 다시 검증합니다. 승인할까요?"))return;
  const btn=$("adminBulkApprovalApply");btn.disabled=true;
  $("adminBulkApprovalStatus").textContent="학교별 승인 진행 중입니다.";
  try{
   const result=await call({action:"bulk_verified",preview:false,limit:400,
      confirmation:"APPROVE_VERIFIED_EXACT_SNAPSHOTS"});
   if(!result.ok||result.preview!==false)throw Error("bulk_failed");
   const success=Number(result.approved_count)||0,fail=Number(result.failed_count)||0;
   $("adminBulkApprovalStatus").textContent="다량승인 완료 · 승인 "+success+
      "개교, 실패 "+fail+"개교. Lv.2 최종 공개 설정도 별도로 확인하세요.";
   await Promise.all([refresh(),refreshPipeline()]);
   await previewBulk();
  }catch{
   $("adminBulkApprovalStatus").textContent="일괄승인 실패 · 검토 기록, 스냅샷 및 MFA 상태 확인 필요.";
  }finally{if(role==="owner"&&ready)btn.disabled=false;}
 }
 $("adminBulkApprovalPreview").addEventListener("click",()=>void previewBulk());
 $("adminBulkApprovalApply").addEventListener("click",()=>void applyBulk());
 function renderLevelApprovals(items){
   const rows=Array.isArray(items)?items:[];
   for(let level=0;level<=2;level++){
     const data=rows.find(x=>x?.level===level),approved=data?.approved===true;
     const eligible=knownCount(data?.eligible_schools),covered=knownCount(data?.covered_schools);
     const released=knownCount(data?.released_schools);
     put("adminWaterwayEligible"+level,countText(eligible));
     put("adminWaterwayReleased"+level,countText(released));
     const button=$("adminLevelReleaseButton"+level),revoke=$("adminLevelReleaseRevoke"+level);
     $("adminLevelReleaseState"+level).textContent=!data?"확인 불가":approved?"승인됨":"승인 대기";
     $("adminLevelReleaseCovered"+level).textContent=countText(covered);
     button.textContent=approved?(covered<eligible?"새로 승인된 학교 반영":"Lv."+level+" 승인 완료"):"Lv."+level+" 최종 공개 승인";
     button.disabled=!data||role!=="owner"||eligible===null||covered===null||eligible<1||(approved&&covered>=eligible);
     revoke.hidden=!approved||role!=="owner";
     revoke.disabled=!approved||role!=="owner";
   }
   $("adminLevelReleaseStatus").textContent=rows.length!==3?
     "레벨 상태를 확인할 수 없어 승인 기능을 중단했습니다.":
     role==="owner"?"학교별 승인을 마친 현재 자료만 포함됩니다. 이후 승인된 학교는 레벨별 재승인이 필요합니다.":
       "조회 전용 계정: 소유자만 최종 공개 승인할 수 있습니다.";
 }
 async function decideLevel(level,action,button){
   if(!ready||role!=="owner"||button.disabled)return;
   const label="Lv."+level;
   if(!window.confirm(action==="REVOKE"?
     label+"의 2026 자료 공개를 중단하시겠습니까? 다른 레벨은 변경되지 않습니다.":
     label+"에서 학교별 최종 승인된 현재 2026 자료를 공개하도록 최종 승인하시겠습니까?"))return;
   button.disabled=true;
   try{
     const result=await call({action:"level_decision",level,decision:action});
     if(result?.ok!==true||result.level!==level)throw Error("invalid_result");
     await refreshPipeline();
     $("adminLevelReleaseStatus").textContent=label+(action==="REVOKE"?" 공개 중단":" 최종 공개 승인")+"이 서버에 기록됐습니다.";
   }catch{
     await refreshPipeline();
     $("adminLevelReleaseStatus").textContent="처리 실패: 학교별 검증·승인, 관리자 MFA, 서버 연결을 확인하세요.";
   }
 }
 for(let level=0;level<=2;level++){
   $("adminLevelReleaseButton"+level).addEventListener("click",event=>void decideLevel(level,"APPROVE",event.currentTarget));
   $("adminLevelReleaseRevoke"+level).addEventListener("click",event=>void decideLevel(level,"REVOKE",event.currentTarget));
 }
 $("adminLevelReleaseReload").addEventListener("click",()=>void refreshPipeline());
 window.Beagu2026ReviewAdmin={mount,reset};
})();
