/**
 * 2026 배구지수 추천 검증 추가 파일 (Referral.gs).
 * 기존 Code.gs, MBTI 스크립트, 설문 링크 및 집계 트리거를 교체하지 않습니다.
 * 추천 2개 문항만 읽고, 응답 내용/학교/응답자 이름/원본 행은 전송하지 않습니다.
 * 배포 전 Supabase ingest_enabled=false 이므로 추천 실적은 증가하지 않습니다.
 */
const BEAGU26_REFERRAL_TOKEN_TITLE = "BG26 추천 확인값 (자동 입력)";
const BEAGU26_REFERRAL_DEVICE_TITLE = "BG26 기기 확인값 (자동 입력)";

function beagu26ReferralHeaders_(sheet) {
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  const indices=(title)=>headers.reduce((out,h,i)=>{
    if(String(h).trim()===title)out.push(i+1);
    return out;
  },[]);
  const a=indices(BEAGU26_REFERRAL_TOKEN_TITLE);
  const b=indices(BEAGU26_REFERRAL_DEVICE_TITLE);
  if(a.length!==1||b.length!==1)throw Error("추천 확인용 문항 2개의 제목을 확인해 주세요.");
  return {referral:a[0],device:b[0]};
}
function beagu26ShaHex_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value))
    .map(b=>("0"+((b+256)%256).toString(16)).slice(-2)).join("");
}
function beagu26ProcessReferral_(event) {
  if(!event||!event.range)return "NOT_FORM_EVENT";
  const sheet=event.range.getSheet();
  if(sheet.getName()!==BEAGU26.sourceTab||
    sheet.getParent().getId()!==BEAGU26.sourceId)return "OTHER_SHEET";
  const row=event.range.getRow();
  if(!Number.isSafeInteger(row)||row<2)return "INVALID_ROW";
  const cols=beagu26ReferralHeaders_(sheet);
  // Read ONLY the two new short-answer columns and the submitted timestamp.
  const referral=String(sheet.getRange(row,cols.referral).getDisplayValue()||"").trim();
  const respondent=String(sheet.getRange(row,cols.device).getDisplayValue()||"").trim();
  if(!referral&&!respondent)return "NORMAL_SUBMISSION";
  if(!/^[A-Za-z0-9_-]{43}$/.test(referral)||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(respondent))
    return "INVALID_REFERRAL_FIELDS";
  const stamp=sheet.getRange(row,1).getValue();
  if(!(stamp instanceof Date)||!Number.isFinite(stamp.getTime()))return "INVALID_TIMESTAMP";
  // Stable on duplicate trigger deliveries; include timestamp to prevent row collision.
  const eventKey=beagu26ShaHex_([
    BEAGU26.sourceId,sheet.getSheetId(),row,stamp.getTime()
  ].join(":"));
  const secret=String(PropertiesService.getScriptProperties()
    .getProperty("BEAGU_2026_INGEST_TOKEN")||"").trim();
  if(secret.length<32)throw Error("기존 BEAGU_2026_INGEST_TOKEN이 없습니다.");
  const result=UrlFetchApp.fetch(BEAGU26.supabaseUrl+"/functions/v1/beagu-referral-v1",{
    method:"post",contentType:"application/json",
    headers:{"X-Beagu-Ingest-Token":secret},
    payload:JSON.stringify({action:"ingest",eventKey,
      referralToken:referral,respondentUuid:respondent}),
    muteHttpExceptions:true
  });
  if(result.getResponseCode()===423)return "INGEST_NOT_ENABLED";
  if(result.getResponseCode()!==200)
    throw Error("추천 확인 서버 응답 오류 HTTP "+result.getResponseCode());
  const parsed=JSON.parse(result.getContentText());
  if(parsed.ok!==true)throw Error("추천 확인 응답 검증 오류");
  return parsed.credited===true?"CREDITED":String(parsed.decision||"NOT_CREDITED");
}
/**
 * Owner-only, run ONCE after adding the two Form questions and this file.
 * Existing submit & noon triggers stay intact. Does not turn on the Lv.2 feature.
 */
function installBeagu2026ReferralBridge() {
  const secret=String(PropertiesService.getScriptProperties()
    .getProperty("BEAGU_2026_INGEST_TOKEN")||"").trim();
  if(secret.length<32)throw Error("기존 ingest 토큰을 먼저 설정해 주세요.");
  const sheet=SpreadsheetApp.openById(BEAGU26.sourceId).getSheetByName(BEAGU26.sourceTab);
  if(!sheet)throw Error("기존 응답 시트가 없습니다.");
  beagu26ReferralHeaders_(sheet);
  const exists=ScriptApp.getProjectTriggers().some(
    t=>t.getHandlerFunction()==="onBeagu2026FormSubmitted");
  if(!exists)setupBeagu2026FormSubmitTrigger();
  Logger.log("추천 문항 및 기존 제출 트리거 확인 완료. 추가 트리거는 만들지 않았습니다.");
  Logger.log("1차는 서버 승급 잠금 상태입니다. 기존 설문 집계는 그대로 유지됩니다.");
}
