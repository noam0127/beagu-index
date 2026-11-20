/**
 * 2026 배구지수: 전용 조사 링크용 선택적 설치 스크립트.
 * 기존 2026 집계 스크립트와 독립된 새 파일로 같은 Apps Script 프로젝트에 추가.
 * 현재 서버 발급/승급은 비활성화. 아래 함수는 편집자가 직접 실행할 때만
 * Form의 선택 문항을 추가하거나 트리거를 설치한다.
 *
 * 설문 원문, 답변, 학교명, 이메일/이름은 Supabase에 전달하지 않는다.
 * Q01~Q13 완결성과 Q01~Q11 반복 선택 패턴만 boolean/int로 전송한다.
 * 의심 응답은 추천 적립 대기이며, 허위 응답으로 단정하지 않는다.
 */
const BEAGU_REFERRAL_2026 = Object.freeze({
  spreadsheetId:'1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4',
  questionTitle:'배구지수 추천 확인코드 (전용 링크 자동입력 · 수정하지 마세요)',
  endpoint:'https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-referral-ingest-v1'
});
function beaguReferralFindOfficialForm_(){
  const sheet=SpreadsheetApp.openById(BEAGU_REFERRAL_2026.spreadsheetId).getSheetByName('설문지 응답 시트1');
  if(!sheet)throw Error('공식 2026 설문 응답 탭을 찾지 못했습니다.');
  const url=sheet.getFormUrl();
  if(!url)throw Error('원본 응답 탭에 연결된 Google Form이 없습니다.');
  const form=FormApp.openByUrl(url);
  if(form.getDestinationId()!==BEAGU_REFERRAL_2026.spreadsheetId)
    throw Error('다른 설문지에 연결되어 수정할 수 없습니다.');
  return form;
}
/** Form에 문항을 추가하므로 사전 백업 후 소유자가 직접 1회 실행합니다. */
function prepareBeaguReferralFormField(){
  const form=beaguReferralFindOfficialForm_();
  const matches=form.getItems(FormApp.ItemType.TEXT)
    .filter(item=>item.getTitle()===BEAGU_REFERRAL_2026.questionTitle);
  if(matches.length>1)throw Error('추천 확인코드 항목이 중복되었습니다. 수동 점검하세요.');
  let item=matches.length?matches[0].asTextItem():null;
  if(!item){
    item=form.addTextItem()
      .setTitle(BEAGU_REFERRAL_2026.questionTitle)
      .setHelpText('전용 링크에서 자동으로 입력됩니다. 일반 설문 참여자는 비워 두어도 됩니다. 입력값은 추천 인정 여부 확인 용도로만 처리됩니다.')
      .setRequired(false);
  }
  // Only a dummy URL is generated: never submit a fake response.
  const preview=form.createResponse()
    .withItemResponse(item.createResponse('REFERRAL_PREVIEW'))
    .toPrefilledUrl();
  const match=preview.match(/[?&](entry\.\d+)=REFERRAL_PREVIEW(?:&|$)/);
  if(!match)throw Error('사전입력 entry 번호를 찾지 못했습니다.');
  const props=PropertiesService.getScriptProperties();
  props.setProperty('BEAGU_REFERRAL_FORM_ID',form.getId());
  props.setProperty('BEAGU_REFERRAL_FORM_ITEM_ID',String(item.getId()));
  props.setProperty('BEAGU_REFERRAL_FORM_ENTRY',match[1]);
  // Logs contain only public Form question metadata, no response data or credentials.
  Logger.log('추천용 Form 문항 준비 완료: '+match[1]);
  Logger.log('공식 설문 공개 URL: '+form.getPublishedUrl());
  Logger.log('다음: GitHub js/beagu-referral-form-config-v1.js의 entryName을 '+match[1]+'로 입력');
}
/** 해당 Form만 정확히 확인하고 Form submit 트리거를 추가합니다. */
function installBeaguReferralFormSubmitTrigger(){
  const form=beaguReferralFindOfficialForm_();
  const props=PropertiesService.getScriptProperties();
  const secret=String(props.getProperty('BEAGU_REFERRAL_INGEST_SECRET')||'');
  const itemId=String(props.getProperty('BEAGU_REFERRAL_FORM_ITEM_ID')||'');
  if(secret.length<32)throw Error('BEAGU_REFERRAL_INGEST_SECRET 속성을 먼저 설정해야 합니다.');
  const item=form.getItemById(Number(itemId));
  if(!item || item.getTitle()!==BEAGU_REFERRAL_2026.questionTitle)
    throw Error('추천용 Google Forms 문항 ID가 올바르지 않습니다.');
  const handlers=['onBeaguReferralFormSubmitted','reconcileBeaguReferralResponses'];
  ScriptApp.getProjectTriggers().filter(t=>handlers.includes(t.getHandlerFunction()))
    .forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(handlers[0]).forForm(form).onFormSubmit().create();
  // Recovery after transient network failure. Backend event IDs make replay idempotent.
  ScriptApp.newTrigger(handlers[1]).timeBased().everyHours(1).create();
  const installed=new Set(ScriptApp.getProjectTriggers().map(t=>t.getHandlerFunction()));
  if(!handlers.every(name=>installed.has(name)))
    throw Error('추천 제출·복구 트리거 설치 확인에 실패했습니다.');
  // A first-time installation must not retroactively credit old survey responses.
  if(!props.getProperty('BEAGU_REFERRAL_RECONCILE_FROM_MS'))
    props.setProperty('BEAGU_REFERRAL_RECONCILE_FROM_MS',String(Date.now()));
  Logger.log('공식 Form 제출 이벤트 + 매시간 장애 복구 트리거 설치 완료');
}
/**
 * Only behavioral summaries leave this Form, never answers or form IDs.
 * Uniform answers are a REVIEW SIGNAL, not a finding of misconduct.
 * The 13 official core questions are required; missing/unreadable titles
 * make the case pending instead of approving from an incomplete scan.
 */
function beaguReferralQualitySignals_(formResponse){
  const answers=formResponse.getItemResponses();
  const core=new Map();
  answers.forEach(entry=>{
    const title=String(entry.getItem().getTitle()||"").trim();
    const found=/^Q(0[1-9]|1[0-3])(?:\\.|[\\s:：．])/.exec(title);
    if(!found)return;
    const result=entry.getResponse();
    const value=typeof result==="string"?result.trim():"";
    if(value)core.set(found[1],value);
  });
  const coreAnswered=core.size;
  const frequency={};let normal=0;
  for(let i=1;i<=11;i++){
    const key=String(i).padStart(2,"0");
    const match=/^[①②③④⑤⑥]/.exec(core.get(key)||"");
    if(!match)continue;
    const option=match[0];frequency[option]=(frequency[option]||0)+1;normal++;
  }
  const highest=Math.max(0,...Object.values(frequency));
  // A conservative soft flag; all such responses remain reviewable.
  // Answering consistently is not proof of careless or fraudulent responding.
  const straightline=normal>=10 && highest>=10;
  return {coreAnswered,straightline};
}

/** FormTriggerBuilder에서 제공하는 FormResponse만 처리합니다. */
function onBeaguReferralFormSubmitted(event){
  if(!event || !event.response || !event.source)return;
  const props=PropertiesService.getScriptProperties();
  const formId=String(props.getProperty('BEAGU_REFERRAL_FORM_ID')||'');
  const itemId=Number(props.getProperty('BEAGU_REFERRAL_FORM_ITEM_ID')||0);
  if(!formId || !itemId || event.source.getId()!==formId)return;
  const answers=event.response.getItemResponses();
  const field=answers.find(i=>i.getItem().getId()===itemId);
  const proof=field ? String(field.getResponse()||'').trim() : '';
  if(!proof || !/^BR1\.[a-f0-9]{64}\.[0-9a-f-]{36}\.\d{10}\.[a-f0-9]{64}$/.test(proof))
    return; // Ordinary anonymous responses are never rejected or edited.
  const responseId=String(event.response.getId()||'');
  const timestamp=event.response.getTimestamp();
  if(!/^[A-Za-z0-9_-]{8,180}$/.test(responseId) || !(timestamp instanceof Date))
    throw Error('공식 Form 제출 증명을 확인할 수 없습니다.');
  const secret=String(props.getProperty('BEAGU_REFERRAL_INGEST_SECRET')||'');
  if(secret.length<32)throw Error('추천 서버 키가 설정되지 않았습니다.');
  const result=UrlFetchApp.fetch(BEAGU_REFERRAL_2026.endpoint,{
    method:'post', contentType:'application/json',
    headers:{'X-Beagu-Referral-Ingest-Token':secret},
    payload:JSON.stringify({
      sourceSpreadsheetId:BEAGU_REFERRAL_2026.spreadsheetId,
      formResponseId:responseId,submittedAt:timestamp.toISOString(),proof:proof,
      qualitySignals:beaguReferralQualitySignals_(event.response)
    }),
    muteHttpExceptions:true
  });
  if(result.getResponseCode()!==200)
    throw Error('추천 검사 서버 오류 HTTP '+result.getResponseCode());
  const parsed=JSON.parse(result.getContentText());
  if(parsed.ok!==true)throw Error('추천 검사 서버 결과 이상');
  // Never log response ID, proof, respondent UUID or survey data.
  Logger.log('추천 검사 완료: '+String(parsed.decision));
}


/**
 * Recovery scan: if a network error prevented crediting a real submitted form
 * response, retry from the last completed checkpoint with a 5-minute overlap.
 * The backend makes the same Form response ID idempotent.
 *
 * Reading is limited to the exact response Form and its referral item. This
 * does NOT replicate other teacher answers to a new sheet or the web.
 * Run hourly using the owner-installed time trigger, not a public endpoint.
 */
function reconcileBeaguReferralResponses(){
  const props=PropertiesService.getScriptProperties();
  const checkpoint=Number(props.getProperty('BEAGU_REFERRAL_RECONCILE_FROM_MS'));
  if(!Number.isSafeInteger(checkpoint)||checkpoint<=0)
    throw Error('복구 기준 시점이 없습니다. 먼저 소유자가 추천 트리거를 설치해야 합니다.');
  const start=Date.now();
  if(checkpoint>start+5*60*1000)
    throw Error('복구 기준 시점이 현재보다 미래입니다. 수동 점검이 필요합니다.');
  const form=beaguReferralFindOfficialForm_();
  const from=new Date(Math.max(
    Date.parse('2026-11-01T00:00:00+09:00'),checkpoint-5*60*1000
  ));
  const responses=form.getResponses(from);
  if(responses.length>2000)
    throw Error('복구 대상 응답이 2,000건을 초과해 자동 처리를 보류했습니다.');
  // Only now submitted rows are processed in the form trigger itself.
  // Here, the existing handler is called with the verified Form object.
  for(const response of responses){
    const time=response.getTimestamp();
    if(!(time instanceof Date)||time.getTime()>start+5*60*1000)
      continue;
    onBeaguReferralFormSubmitted({source:form,response});
  }
  props.setProperty('BEAGU_REFERRAL_RECONCILE_FROM_MS',String(start));
  Logger.log('추천 제출 장애 복구 스캔 완료 · 개인정보 또는 제출 원문 비기록');
}

/**
 * 안전한 연결 점검: Google Form 응답은 읽지도 제출하지도 않습니다.
 * 서버 및 스크립트 속성에 동일한 ingest key가 구성되어 있는지만 확인합니다.
 * 서버의 실제 추천 승인 기능은 활성화하지 않습니다.
 */
function testBeaguReferralConnection(){
  const secret=String(PropertiesService.getScriptProperties()
    .getProperty('BEAGU_REFERRAL_INGEST_SECRET')||'');
  if(secret.length<32)throw Error('스크립트 속성에 추천 전송 비밀키가 설정되지 않았습니다.');
  const response=UrlFetchApp.fetch(BEAGU_REFERRAL_2026.endpoint,{
    method:'post', contentType:'application/json',
    headers:{'X-Beagu-Referral-Ingest-Token':secret},
    payload:JSON.stringify({action:'preflight'}),
    muteHttpExceptions:true
  });
  const status=response.getResponseCode();
  let result={};
  try {result=JSON.parse(response.getContentText());}catch(_){}
  if(status!==200 || result.ok!==true){
    const errorCode=typeof result.error==='string'?result.error:'UNKNOWN_ERROR';
    // Preserve the safe public error code but never print submitted secrets.
    const hints={
      REFERRAL_SECRETS_UNAVAILABLE:'Supabase Edge Functions > Secrets의 HMAC_KEY 및 INGEST_SECRET 등록·길이 확인',
      AUTH_REQUIRED:'Apps Script INGEST_SECRET 값과 Supabase INGEST_SECRET 값 일치 확인',
      REFERRAL_INGEST_NOT_READY:'서버 진단 함수 배포 상태 확인',
      UNKNOWN_ERROR:'Supabase 함수 상태·접속 확인'
    };
    throw Error('추천 연결 실패: HTTP '+status+' ['+errorCode+'] · '+
      (hints[errorCode]||hints.UNKNOWN_ERROR));
  }
  Logger.log('추천 연결 정상: 비밀키 일치 확인, 유효한 Google Form 응답 전송 없음');
  Logger.log('실제 추천 실적 처리 서버: '+
    (result.enabled===true?'함수 게이트 켜짐':'함수 게이트 아직 꺼짐'));
}
