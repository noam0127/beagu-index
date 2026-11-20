/**
 * 2026 배구지수: 전용 조사 링크용 선택적 설치 스크립트.
 * 기존 2026 집계 스크립트와 독립된 새 파일로 같은 Apps Script 프로젝트에 추가.
 * 현재 서버 발급/승급은 비활성화. 아래 함수는 편집자가 직접 실행할 때만
 * Form의 선택 문항을 추가하거나 트리거를 설치한다.
 *
 * 설문 원문, 답변, 학교명, 이메일/이름은 Supabase에 전달하지 않는다.
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
  const name='onBeaguReferralFormSubmitted';
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===name)
    .forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(name).forForm(form).onFormSubmit().create();
  if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()===name))
    throw Error('추천 트리거 설치 확인에 실패했습니다.');
  Logger.log('공식 Form 제출 이벤트 → 비공개 추천 검사 트리거 설치 완료');
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
      formResponseId:responseId,submittedAt:timestamp.toISOString(),proof:proof
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
