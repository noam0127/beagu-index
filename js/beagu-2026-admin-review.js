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
   }catch{
     if(token!==pipelineSeq||!ready)return;
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
 function mount(adminRole){
  role=adminRole==="owner"?"owner":"viewer";
  ready=true;page=0;filter="quality";
  $("adminReview2026Filter").value=filter;
  void refresh();
  void refreshPipeline();
  if(role==="owner")void refreshReferralRisks();
 }
 function reset(){
  ready=false;role="";seq++;page=0;pipelineSeq++;
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
 window.Beagu2026ReviewAdmin={mount,reset};
})();
