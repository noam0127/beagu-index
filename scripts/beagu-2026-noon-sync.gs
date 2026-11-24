/**
 * 배구지수 2026 비공개 학교별 통계 집계기
 * 소스: 2026 본조사 Google Forms 응답 시트
 * 대상: 배구지수 학교별 비공개 집계 MASTER
 *
 * 설치: 원본 응답 시트의 확장 프로그램 > Apps Script 에 전체 붙여넣기
 *       프로젝트 설정 > 스크립트 속성에 SUPABASE_PUBLISHABLE_KEY 저장
 *       installBeagu2026Sync()를 한 번 수동 실행해 권한 승인 및 트리거 2종 설치
 * 테스트: refreshBeagu2026Stats()를 수동 실행한다.
 * 정오: Asia/Seoul 12:00 부근(구글 Apps Script 트리거는 ±15분 지연 가능)
 *
 * 개인정보: 개별 응답 원문과 자유서술은 집계 MASTER로 복사하지 않는다.
 * 공개 API와의 연결은 별도 검수/승인 절차를 거쳐야 한다.
 */
const BEAGU26 = Object.freeze({
  sourceId: "1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4",
  sourceTab: "설문지 응답 시트1",
  destinationId: "1I9SXXmOCnyeWP3RjoBHW5Tfvg0RpgR4RjnEVoxZvpp8",
  summaryTab: "학교별_집계_내부",
  holdTab: "학교매칭_보류",
  logTab: "정오_실행로그",
  timezone: "Asia/Seoul",
  firstOfficialResponseDay: "2026-11-01",
  supabaseUrl: "https://snvzwrexuqavnfvzgxqj.supabase.co",
  maxResponses: 50000,
  maxSchools: 10000
});
function setupDailyNoonTrigger() {
  const existing=ScriptApp.getProjectTriggers();
  // Replace both older single-pipeline jobs and duplicates with one backup job.
  existing.filter(t=>["refreshBeagu2026Stats","refreshBeagu2026SchoolCulture","refreshBeagu2026AllPrivateStats"].includes(t.getHandlerFunction()))
    .forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("refreshBeagu2026AllPrivateStats").timeBased()
    .everyDays(1).atHour(12).nearMinute(0).inTimezone(BEAGU26.timezone).create();
  Logger.log("매일 한국시간 정오 부근(±15분) 학교별·학교문화 집계 백업 트리거를 설치했습니다.");
}
/**
 * One refresh entrypoint for form submission and the daily fallback.
 * Both pipelines ONLY write to private review sheets; neither authorizes
 * publication. MBTI is optional for backward compatibility with installs
 * where the second source file has not yet been added.
 */
// Send only aggregate run metadata; never include exception text, source rows,
// answers, school identifiers, or credentials in the payload.
function beagu26RunReason(e){
  const message=String(e?.message||"");
  if(/토큰|TOKEN|인증|설정 필요/i.test(message))return "AUTH_CONFIG";
  const http=message.match(/HTTP\s+(\d{3})/);
  if(http){
    if(["401","403","409","429"].includes(http[1]))return "HTTP_"+http[1];
    return http[1][0]==="5"?"HTTP_5XX":"HTTP_OTHER";
  }
  if(/partial sync/i.test(message))return "PARTIAL_SYNC";
  if(/열|행 안전|원본|MASTER|column count|grid row/i.test(message))return "SOURCE_OR_SCHEMA";
  return "STAGE_ERROR";
}
function beagu26SendRunReport(report){
  try{
    const token=PropertiesService.getScriptProperties().getProperty("BEAGU_2026_INGEST_TOKEN")||"";
    if(token.length<32)return;
    const response=UrlFetchApp.fetch(BEAGU26.supabaseUrl+"/functions/v1/beagu-2026-results-ingest",{
      method:"post",contentType:"application/json",headers:{"X-Beagu-Ingest-Token":token},
      payload:JSON.stringify(report),muteHttpExceptions:true
    });
    if(response.getResponseCode()!==200)Logger.log("BEAGU26_RUN_REPORT_FAILED HTTP "+response.getResponseCode());
  }catch(e){Logger.log("BEAGU26_RUN_REPORT_UNAVAILABLE");}
}
function refreshBeagu2026AllPrivateStats() {
  if(typeof refreshBeagu2026QuestionResults!=="function")throw Error("최신 Code.gs 설치 필요");
  const report={kind:"WATERWAY_RUN_V1",started_at:new Date().toISOString(),finished_at:null,
    source_rows:null,basic_review_rows:null,stages:["SOURCE","QUESTION_RESULTS","CORE_AND_QA","SCHOOL_CULTURE"]
      .map(stage=>({stage,status:"SKIPPED",reason:"NOT_INSTALLED",duration_ms:0}))};
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(180000)){
    report.stages[0]={stage:"SOURCE",status:"ERROR",reason:"LOCK_BUSY",duration_ms:0};
    report.finished_at=new Date().toISOString();
    beagu26SendRunReport(report);
    throw Error("다른 2026 전체 집계가 실행 중입니다.");
  }
  const failures=[];
  const runStage=(index,work)=>{
    const started=Date.now(),stage=report.stages[index].stage;
    try {
      const result=work();
      report.stages[index]={stage,status:"SUCCESS",reason:"NONE",duration_ms:Date.now()-started};
      Logger.log("BEAGU26_STAGE "+stage+" SUCCESS "+(Date.now()-started)+"ms");
      return result;
    }catch(e){
      failures.push(e);
      report.stages[index]={stage,status:"ERROR",reason:beagu26RunReason(e),duration_ms:Date.now()-started};
      Logger.log("BEAGU26_STAGE "+stage+" ERROR "+(Date.now()-started)+"ms");
      return null;
    }
  };
  try{
    const snapshot=runStage(0,()=>{
      const s=readBeagu2026SourceSnapshot();
      if(s.values.length){
        const c=questionColumns(s.values[0]);
        report.source_rows=s.values.slice(1).filter(r=>r[0]||r[c.school]).length;
      }
      return s;
    });
    if(snapshot){
      runStage(1,()=>{
        const result=refreshBeagu2026QuestionResults(snapshot);
        if(Number.isSafeInteger(result?.basicReviewRows))report.basic_review_rows=result.basicReviewRows;
      });
      runStage(2,()=>{
        const result=refreshBeagu2026Stats(snapshot);
        if(result&&(result.privateQaStatus==="PRIVATE_QA_ERROR"||result.publishStatus==="PUBLIC_ERROR"))throw Error("CORE_AND_QA partial sync failed");
      });
      if(typeof refreshBeagu2026SchoolCulture==="function"){
        runStage(3,()=>refreshBeagu2026SchoolCulture(snapshot));
      }else Logger.log("Q14~Q17 학교문화 자동 집계 미설치: MBTI 스크립트 파일을 추가하세요.");
    }
    if(failures.length)throw failures[0];
  }finally{
    lock.releaseLock();
    report.finished_at=new Date().toISOString();
    beagu26SendRunReport(report);
  }
}
// Optional near-real-time private aggregation after each genuine Google Form submission.
// This never publishes a result or bypasses the per-school privacy review.
function setupBeagu2026FormSubmitTrigger() {
  const name="onBeagu2026FormSubmitted";
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===name)
    .forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(name).forSpreadsheet(BEAGU26.sourceId).onFormSubmit().create();
  Logger.log("2026 본조사 응답 제출 후 비공개 집계 갱신 트리거를 설치했습니다.");
}
function onBeagu2026FormSubmitted(event) {
  // Only an installed spreadsheet form-submit trigger, never a direct web request.
  if(!event||!event.range||event.range.getSheet().getName()!==BEAGU26.sourceTab)return;
  // Idempotently recompute both private summaries (Q01-Q13 and Q14-Q17).
  // A submitted response is never directly published as a school result.
  refreshBeagu2026AllPrivateStats();
}
// Send ONLY a national total of official submission rows. No school IDs,
// teacher responses, answer content, timestamps, or per-school counts leave
// the private aggregation workflow. This is NOT a distinct-teacher count.
function fetchBeaguHistoricalSurveyedSchools() {
  // Protected by the existing 32+-character server-to-server ingest token.
  // Only historical IDs are downloaded to this private script. No 2026
  // school ID/name is ever transmitted to the public-count backend.
  const secret=PropertiesService.getScriptProperties().getProperty("BEAGU_2026_INGEST_TOKEN")||"";
  if(secret.length<32)throw Error("배구지수 서버 인증 토큰이 설정되지 않았습니다.");
  const endpoint=BEAGU26.supabaseUrl+"/functions/v1/beagu-2026-public-count-ingest";
  const response=UrlFetchApp.fetch(endpoint,{
    method:"get",
    headers:{"X-Beagu-Ingest-Token":secret},
    muteHttpExceptions:true
  });
  if(response.getResponseCode()!==200)throw Error("과거 참여학교 대조 조회 실패: HTTP "+response.getResponseCode());
  const history=JSON.parse(response.getContentText());
  if(!Array.isArray(history.school_ids)||history.school_ids.length<3000||
    !Array.isArray(history.unresolved))throw Error("과거 참여학교 목록이 불완전합니다.");
  return history;
}
function countBeagu2026FirstTimeSchools(groups) {
  const history=fetchBeaguHistoricalSurveyedSchools();
  const historicalIds=new Set(history.school_ids.map(id=>String(id).trim()));
  // For 2023–2025 rows lacking an official school ID, conservatively match
  // by normalized school name AND region so they cannot be counted as new.
  const unresolvedRegionNames=new Set(history.unresolved.map(r=>
    regionOf(r.sido)+"|"+normalize(r.school_name)));
  let count=0;
  groups.forEach(g=>{
    const school=g.school;
    const id=String(school.school_id||"").trim();
    const fallbackKey=regionOf(school.sido_standard)+"|"+normalize(school.school_name);
    if(!historicalIds.has(id)&&!unresolvedRegionNames.has(fallbackKey))count++;
  });
  return count;
}
function publishBeagu2026NationalCount(officialRows,newUniqueSchools) {
  const secret=PropertiesService.getScriptProperties().getProperty("BEAGU_2026_INGEST_TOKEN")||"";
  if(secret.length<32)return "SKIPPED_NOT_CONFIGURED";
  if(!Number.isSafeInteger(officialRows)||officialRows<0||officialRows>50000)
    throw Error("Official response-row count is invalid");
  if(!Number.isSafeInteger(newUniqueSchools)||newUniqueSchools<0||newUniqueSchools>officialRows)
    throw Error("First-time-school count is invalid");
  const endpoint=BEAGU26.supabaseUrl+"/functions/v1/beagu-2026-public-count-ingest";
  const response=UrlFetchApp.fetch(endpoint,{
    method:"post",contentType:"application/json",
    headers:{"X-Beagu-Ingest-Token":secret},
    payload:JSON.stringify({
      source_spreadsheet_id:BEAGU26.sourceId,
      first_official_day:BEAGU26.firstOfficialResponseDay,
      official_submission_rows:officialRows,
      new_unique_schools:newUniqueSchools
    }),
    muteHttpExceptions:true
  });
  if(response.getResponseCode()!==200)
    throw Error("National count publish failed: HTTP "+response.getResponseCode());
  return "PUBLISHED";
}
/**
 * Forward only per-school QA counts to a private, token-authenticated endpoint.
 * No source teacher row, selected option, contact, free-text or school name.
 * 2026 school-specific survey results are NEVER approved or published here.
 */
function sendBeagu2026PrivateQaChecks(groups){
  const token=String(PropertiesService.getScriptProperties().getProperty("BEAGU_2026_INGEST_TOKEN")||"").trim();
  if(token.length<32)throw Error("비공개 검수 전송 토큰이 설정되지 않았습니다.");
  const schools=[...groups.values()].map(g=>({
    school_id:String(g.school.school_id),
    school_response_rows:g.rows,
    school_match_status:(g.typeConflict||g.rowReview)?"NEEDS_REVIEW":"EXACT_REGION_OFFICE_NAME",
    core_valid_counts:Object.fromEntries(g.counts.map((n,i)=>[
      "Q"+String(i+1).padStart(2,"0"),n
    ]))
  }));
  const endpoint=BEAGU26.supabaseUrl+"/functions/v1/beagu-2026-private-qa-ingest";
  let accepted=0;
  for(let i=0;i<schools.length;i+=60){
    const batch=schools.slice(i,i+60);
    const res=UrlFetchApp.fetch(endpoint,{
      method:"post",contentType:"application/json",
      headers:{"X-Beagu-Ingest-Token":token},
      payload:JSON.stringify({
        source_spreadsheet_id:BEAGU26.sourceId,
        official_start_day:BEAGU26.firstOfficialResponseDay,
        schools:batch
      }),muteHttpExceptions:true
    });
    if(res.getResponseCode()!==200)
      throw Error("비공개 검수 집계 전송 실패: HTTP "+res.getResponseCode());
    const result=JSON.parse(res.getContentText());
    if(result.ok!==true||result.accepted!==batch.length)
      throw Error("비공개 검수 집계 확인 오류");
    accepted+=result.accepted;
  }
  return "SENT_"+accepted;
}
/**
 * Owner-run setup. This must execute inside the original Google Apps Script
 * project with the owner's OAuth approval. GitHub commits do not install it.
 * Never print or transmit the secret values in the log.
 */
// Owner preview only: read original source and official school directory.
// No sheet writes, ingest calls, trigger changes or release approval.
// Approved Q45 wording history is recorded in docs/2026-q45-wording-history.md.
function beagu26WaterwayPreview(values,schools,catalog){
  const describe=result=>{
    const review=new Set(result.reviewRows.map(r=>r[0]));
    const schema=new Set(result.reviewRows.filter(r=>r[4]==="SCHEMA_LABEL_REVIEW").map(r=>r[0]));
    return {totals:result.totals,schools:result.schools.length,
      matched_rows:result.schools.reduce((n,s)=>n+s.school_response_rows,0),
      review_rows:review.size,schema_review_rows:schema.size,
      technical_candidates:result.schools.filter(s=>s.school_match_status==="EXACT_REGION_OFFICE_NAME"&&s.questions.every(q=>q.invalid===0)).length};
  };
  return {mode:"READ_ONLY_NOT_AUTHORIZATION",current:describe(beagu26BuildResults(values,schools,catalog)),
    q45_wording_change_confirmed:true};
}
function previewBeagu2026Waterway(){
  const snapshot=readBeagu2026SourceSnapshot();
  const result=beagu26WaterwayPreview(snapshot.values,snapshot.schools,BEAGU26_QUESTION_CATALOG);
  Logger.log(JSON.stringify(result));
  return result;
}

function installBeagu2026Sync() {
  const props=PropertiesService.getScriptProperties();
  const key=String(props.getProperty("SUPABASE_PUBLISHABLE_KEY")||"").trim();
  const token=String(props.getProperty("BEAGU_2026_INGEST_TOKEN")||"").trim();
  if(!key)throw Error("설치 중단: 스크립트 속성 SUPABASE_PUBLISHABLE_KEY가 없습니다.");
  if(token.length<32)throw Error("설치 중단: BEAGU_2026_INGEST_TOKEN은 32자 이상의 비밀 값이어야 합니다.");
  setupBeagu2026FormSubmitTrigger();
  setupDailyNoonTrigger();
  const active=ScriptApp.getProjectTriggers().map(t=>t.getHandlerFunction());
  if(!active.includes("onBeagu2026FormSubmitted")||!active.includes("refreshBeagu2026AllPrivateStats"))
    throw Error("자동 집계 트리거 설치를 확인하지 못했습니다.");
  if(typeof refreshBeagu2026SchoolCulture!=="function")
    Logger.log("Q14~Q17 스크립트가 없어 수직성 Q01~Q13만 자동 집계됩니다.");
  Logger.log("2026 본조사 제출/정오 백업 트리거 확인 완료. 인증키 값은 기록하지 않습니다.");
  // Initial private aggregation; output count remains inaccessible to public roles.
  refreshBeagu2026AllPrivateStats();
  Logger.log("초기 비공개 집계 완료. 다음부터 개별 등록 명령 없이 새 설문 제출 때마다 갱신합니다.");
}
function normalize(s) {
  return String(s||"").replace(/[①-⑳㉑-㉟㊱-㊿]/g,"").normalize("NFKC").replace(/[\s,.'"“”\[\]()/\\\-]/g,"").trim();
}
function regionOf(s) {
  const v=normalize(s).replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g,"");
  const mapping=[
    ["재외한국학교","재외한국학교"],["서울","서울"],["부산","부산"],["대구","대구"],["인천","인천"],
    ["광주","광주"],["대전","대전"],["울산","울산"],["세종","세종"],
    ["경기","경기"],["강원","강원"],["충북","충북"],["충남","충남"],
    ["전북","전북"],["전남","전남"],["경북","경북"],["경남","경남"],["제주","제주"]
  ];
  const found=mapping.find(([k])=>v.startsWith(k));
  return found ? found[1] : null;
}
function normalizeOffice(s) {
  const raw=normalize(s);
  // A Form's explicit 'no office (Sejong)' choice and the directory's
  // Sejong education office name refer to the same *unique* area.
  if(raw==='교육지원청없음세종'||raw==='세종특별자치시교육청')return '세종';
  const value=raw.replace(/서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전북특별자치도|전라북도|전라남도|전남광주통합특별시|경상북도|경상남도|제주특별자치도/g,'');
  // Keep Changwon, Masan and Jinhae distinct. The questionnaire uses
  // '...권' while the verified school directory uses '...센터'.
  if(/^창원교육지원청(?:마산센터|마산권)$/.test(value)||/^마산(?:교육지원청|교육청|센터)?(?:폐지)?$/.test(value))return '마산';
  if(/^창원교육지원청(?:진해센터|진해권)$/.test(value)||/^진해(?:교육지원청|교육청|센터)?(?:폐지)?$/.test(value))return '진해';
  if(/^창원(?:교육지원청|교육청)?(?:본청|폐지|의창·성산권|의창성산권)?$/.test(value))return '창원';
  return value.replace(/교육지원청|교육청/g,'');
}
function fetchSchools() {
  const key=PropertiesService.getScriptProperties().getProperty("SUPABASE_PUBLISHABLE_KEY");
  if(!key)throw Error("스크립트 속성 SUPABASE_PUBLISHABLE_KEY를 설정하세요.");
  const out=[];
  for(let offset=0;offset<BEAGU26.maxSchools;offset+=1000) {
    const url=BEAGU26.supabaseUrl+"/rest/v1/schools?select=school_id,school_name,sido_standard,support_office,establishment,status&status=eq.%EC%9A%B4%EC%98%81&order=school_id.asc&limit=1000&offset="+offset;
    const response=UrlFetchApp.fetch(url,{headers:{"apikey":key},muteHttpExceptions:true});
    if(response.getResponseCode()!==200)throw Error("학교 MASTER 조회 실패: HTTP "+response.getResponseCode());
    const list=JSON.parse(response.getContentText());
    if(!Array.isArray(list))throw Error("학교 목록 형식 불일치");
    out.push(...list);
    if(list.length<1000)return out;
  }
  throw Error("학교 MASTER 수가 안전 한도를 초과했습니다. 제한을 점검하세요.");
}
function questionColumns(headers) {
  const q=[];
  for(let i=1;i<=13;i++){
    const name="Q"+String(i).padStart(2,"0");
    const hits=[];
    headers.forEach((h,j)=>{if(new RegExp("^"+name+"\\.").test(String(h).trim()))hits.push(j)});
    if(hits.length!==1)throw Error(name+" 문항 열 탐색 오류: "+hits.length+"개");
    q.push(hits[0]);
  }
  const school=headers.findIndex(h=>/^B03\./.test(String(h)));
  const schoolType=headers.findIndex(h=>/^B04\./.test(String(h)));
  const region=headers.findIndex(h=>/^B01\./.test(String(h)));
  const office=headers.map((h,i)=>/^B02\./.test(String(h))?i:-1).filter(i=>i>=0);
  if(school<0||schoolType<0||region<0||office.length<1)throw Error("지역·지원청·학교명·설립유형 열을 확인하세요.");
  return {q,school,schoolType,region,office};
}
function questionScore(code,answer){
  const s=String(answer||"").trim();
  if(!s)return null;
  const positive=new Set([1,6,7,9,10,11]);
  const reverse=new Set([2,3,4,5,8]);
  const regular=["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"];
  if(positive.has(code)||reverse.has(code)){
    const idx=regular.indexOf(s);
    if(idx<0)throw Error("Q"+code+" 확인되지 않은 보기");
    if(idx===5)return null;
    return positive.has(code)?idx*25:(4-idx)*25;
  }
  if(code===12){
    const opts={
      "① 운영하지 않는다":100,"② 희망자만 참여한다":100,
      "③ 희망과 관계없이 배정하지만 조정할 수 있다":50,
      "④ 희망과 관계없이 배정하고 조정하기 어렵다":0,
      "⑤ 잘 모르겠다":null
    };
    if(!Object.prototype.hasOwnProperty.call(opts,s))throw Error("Q12 보기 불일치");
    return opts[s];
  }
  if(code===13){
    const opts={
      "① 그런 일이 없다":100,
      "② 요청은 있지만 자유롭게 거절할 수 있다":100,
      "③ 거절하면 눈치나 부담을 준다":25,
      "④ 사실상 거절하기 어렵다":0,
      "⑤ 판단하기 어렵다":null
    };
    if(!Object.prototype.hasOwnProperty.call(opts,s))throw Error("Q13 보기 불일치");
    return opts[s];
  }
  return null;
}
// Record a source-row pointer, never the free-text answer, in the PRIVATE MASTER.
// An unknown choice invalidates only this score and cannot be auto-published.
function beagu26ScoreOrReview(code, answer, sourceRow, schoolId, reviewRows) {
  try { return questionScore(code, answer); }
  catch(e) {
    if(!/보기/.test(String(e.message||"")))throw e;
    reviewRows.push([
      sourceRow, String(schoolId), "Q"+String(code).padStart(2,"0"),
      code===12||code===13?"OTHER_OR_UNKNOWN":"UNKNOWN_OPTION",
      "원본 시트의 해당 행·문항을 확인하고 코드북을 검수", "PENDING_REVIEW"
    ]);
    return null;
  }
}
// Cache only the current snapshot directory; no respondent row numbers or
// historical school IDs can override the exact identity resolver.
const BEAGU26_SCHOOL_INDEXES=new WeakMap();
function beagu26PrepareSchoolIndex(schools) {
  const index=new Map();
  for(const s of schools){
    const key=JSON.stringify([regionOf(s.sido_standard),normalizeOffice(s.support_office),normalize(s.school_name)]);
    if(!index.has(key))index.set(key,[]);
    index.get(key).push(s);
  }
  BEAGU26_SCHOOL_INDEXES.set(schools,index);
}
function beagu26AuditPriorExactMatches(values,schools,priorRows,holdRows) {
  const result={candidates:0,reusable:0,held:0};
  const c=questionColumns(values[0]),prior=new Map(),holds=new Map();
  for(const r of holdRows){
    const n=Number(r[0]);
    if(!holds.has(n))holds.set(n,[]);
    holds.get(n).push(r);
  }
  for(const r of priorRows){
    if(r[2]!=="UNIQUE_EXACT_MATCH_RECHECK")continue;
    result.candidates++;
    const n=Number(r[0]);
    if(!prior.has(n))prior.set(n,[]);
    prior.get(n).push(r);
  }
  for(const [n,records] of prior){
    const r=Number.isSafeInteger(n)&&n>=2?values[n-1]:null;
    const old=holds.get(n)||[];
    if(records.length!==1||!r||old.length!==1){result.held+=records.length;continue;}
    const evidence=records[0],previous=old[0],day=getSubmittedDay(r[0]);
    const offices=c.office.map(i=>String(r[i]||"").trim()).filter(Boolean);
    if(evidence[4]!=="원본 기본정보 일치"||evidence[1]!=="학교 MASTER 미매칭"||
        previous[4]!=="학교 MASTER 미매칭"||!day||day<BEAGU26.firstOfficialResponseDay||day>"2026-12-31"||
        offices.length!==1||normalize(r[c.region])!==normalize(previous[1])||
        normalize(offices[0])!==normalize(previous[2])||normalize(r[c.school])!==normalize(previous[3])){
      result.held++;continue;
    }
    const exact=resolveSchool(r,c,schools);
    if(!exact.school||String(exact.school.school_id)!==String(evidence[3])||
        exact.school.status!=="운영"||exact.typeConflict){result.held++;continue;}
    result.reusable++;
  }
  return result;
}
function resolveSchool(row,c,schools) {
  const schoolName=normalize(row[c.school]);
  const region=regionOf(row[c.region]);
  const officeNames=c.office.map(i=>String(row[i]||"").trim()).filter(Boolean);
  if(!schoolName||!region||officeNames.length!==1)return {error:"학교·지역·교육지원청 필수값 누락 또는 중복"};
  const office=normalizeOffice(officeNames[0]);
  if(!office)return {error:"교육지원청을 식별할 수 없음"};
  const index=BEAGU26_SCHOOL_INDEXES.get(schools);
  const same=index?(index.get(JSON.stringify([region,office,schoolName]))||[]):schools.filter(s=>regionOf(s.sido_standard)===region
    &&normalize(s.school_name)===schoolName
    &&normalizeOffice(s.support_office)===office);
  if(same.length!==1)return {error:same.length===0?"학교 MASTER 미매칭":"동일명 학교 중복",region,office};
  // B04 is used for a *review flag*, not as a replacement for the unique
  // region + office + school-name identity match.
  const selectedType=String(row[c.schoolType]||"").match(/(?:공립|국립|사립)/)?.[0]||"";
  const registeredType=String(same[0].establishment||"").match(/(?:공립|국립|사립)/)?.[0]||"";
  const typeConflict=!!selectedType&&!!registeredType&&selectedType!==registeredType;
  return {school:same[0],region,office,typeConflict,selectedType,registeredType};
}
function replaceBody(sheet,rows,columns) {
  const necessary=rows.length+1;
  if(sheet.getMaxRows()<necessary)sheet.insertRowsAfter(sheet.getMaxRows(),necessary-sheet.getMaxRows());
  const old=Math.max(0,sheet.getLastRow()-1);
  const clearRows=Math.max(old,rows.length);
  if(clearRows)sheet.getRange(2,1,clearRows,columns).clearContent();
  if(rows.length)sheet.getRange(2,1,rows.length,columns).setValues(rows);
}
function getSubmittedDay(value) {
  // Google Sheets display values can use "2026. 11. 1. 오전 ..." or ISO dates.
  const m=String(value||"").trim().match(/^(\d{4})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})/);
  if(!m)return null;
  const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
  return [m[1],m[2].padStart(2,"0"),m[3].padStart(2,"0")].join("-");
}
function refreshBeagu2026Stats(snapshot) {
  if(!snapshot?.values)snapshot=null;
  const lock=snapshot?null:LockService.getScriptLock();
  if(lock&&!lock.tryLock(30000))throw Error("이미 다른 집계가 실행 중입니다.");
  let scanned=0,matched=0,unmatched=0,prelaunch=0,undated=0;
  let destination;
  try{
    destination=SpreadsheetApp.openById(BEAGU26.destinationId);
    const {values,schools}=snapshot||readBeagu2026SourceSnapshot();
    const columns=questionColumns(values[0]);
    const signals=beagu26RowReviewSignals(values,columns,schools);
    const groups=new Map(),holds=[],reviewRows=[];
    for(let i=1;i<values.length;i++){
      const r=values[i];
      if(!r[0]&&!r[columns.school])continue;
      scanned++;
      const submittedDay=getSubmittedDay(r[0]);
      // Never mix pilot/prelaunch and official 2026 survey responses.
      if(submittedDay && submittedDay<BEAGU26.firstOfficialResponseDay){prelaunch++;continue;}
      if(!submittedDay||submittedDay>"2026-12-31"){undated++;unmatched++;holds.push([i+1,"","","","응답 시각 확인 불가","NEEDS_REVIEW"]);continue;}
      const m=resolveSchool(r,columns,schools);
      if(!m.school){
        holds.push([i+1,String(r[columns.region]||""),columns.office.map(k=>r[k]).filter(Boolean).join("/"),String(r[columns.school]||""),m.error,"NEEDS_REVIEW"]);
        unmatched++;continue;
      }
      const key=m.school.school_id;
      if(m.typeConflict){
        holds.push([i+1,String(r[columns.region]||""),String(r[columns.office.find(k=>r[k]) ]||""),
          String(r[columns.school]||""),"설립유형 선택("+m.selectedType+")과 학교공시("+m.registeredType+") 불일치","NEEDS_TYPE_REVIEW"]);
      }
      const scores=[];
      for(let j=0;j<13;j++)scores.push(beagu26ScoreOrReview(j+1,r[columns.q[j]],i+1,key,reviewRows));
      let g=groups.get(key);
      if(!g){g={school:m.school,counts:Array(13).fill(0),sums:Array(13).fill(0),rows:0,viScores:[],typeConflict:false};groups.set(key,g)}
      const rowSignals=signals.get(i)||new Set();
      g.typeConflict = g.typeConflict || m.typeConflict;
      g.rowReview = g.rowReview || rowSignals.has("DUPLICATE_SUSPECT") || rowSignals.has("MANDATORY_MISSING");
      for(const reason of rowSignals){
        if(reason!=="SCHOOL_TYPE_REVIEW")reviewRows.push([i+1,key,"ROW",reason,"원본 응답 검수 · 자동 삭제 금지","PENDING_REVIEW"]);
      }
      g.rows++;
      scores.forEach((v,j)=>{if(typeof v==="number"){g.counts[j]++;g.sums[j]+=v}});
      const v=scores.filter(x=>typeof x==="number");
      if(v.length)g.viScores.push(v.reduce((a,b)=>a+b,0)/v.length);
    }
    const now=Utilities.formatDate(new Date(),BEAGU26.timezone,"yyyy-MM-dd HH:mm:ss");
    const output=[...groups.values()].sort((a,b)=>String(a.school.school_id).localeCompare(String(b.school.school_id))).map(g=>{
      const s=g.school;
      const avg=g.sums.map((sum,j)=>g.counts[j]?Math.round(sum/g.counts[j]*10)/10:"");
      const vi=g.viScores.length?Math.round(g.viScores.reduce((a,b)=>a+b,0)/g.viScores.length*10)/10:"";
      return [String(s.school_id),s.sido_standard,s.support_office,s.school_name,g.rows,...avg,vi,"",g.typeConflict?"NEEDS_TYPE_REVIEW":g.rowReview?"NEEDS_RESPONSE_REVIEW":"PENDING_VERIFICATION",now,g.typeConflict?"설립유형 응답과 공시정보 불일치 · 내부 참고값만 보관 · 학교유형·공개동의 검수 대기":"원자료 재집계(비공개) · 공식 2026 백분위 산식/공개 검수 대기"];
    });
    // 원본 데이터와 학교 매칭 오류 검사를 모두 마친 뒤에만 결과 시트를 갱신한다.
    replaceBody(destination.getSheetByName(BEAGU26.summaryTab),output,23);
    replaceBody(destination.getSheetByName(BEAGU26.holdTab),holds,6);
    const reviewTab=destination.getSheetByName("2026_기타응답_검수대기")
      ||destination.insertSheet("2026_기타응답_검수대기");
    reviewTab.getRange(1,1,1,6).setValues([[
      "원본행번호","학교ID","문항","검수유형","조치안내","집계상태"
    ]]);
    replaceBody(reviewTab,reviewRows,6);
    matched=output.length;
    // Holds include both unresolved schools and independently flagged type conflicts.
    unmatched=holds.length;
    // Synchronize nationwide submission-row count to an INTERNAL service-role-only
    // backend. Public counter UI and table SELECT permissions are disabled.
    // Never transmit single-school or individual teacher answers.
    let privateQaStatus="SKIPPED";
    try{
      privateQaStatus=sendBeagu2026PrivateQaChecks(groups);
    }catch(e){
      privateQaStatus="PRIVATE_QA_ERROR";
      Logger.log("2026 private QA staging: "+String(e.message||e).slice(0,150));
    }
    let publishStatus="SKIPPED";
    try{
      const newUniqueSchools=countBeagu2026FirstTimeSchools(groups);
      publishStatus=publishBeagu2026NationalCount(scanned-prelaunch-undated,newUniqueSchools);
    }
    catch(e){publishStatus="PUBLIC_ERROR";Logger.log("National count publish: "+String(e.message||e).slice(0,100))}
    destination.getSheetByName(BEAGU26.logTab).appendRow([now,scanned,matched,unmatched,
      privateQaStatus==="PRIVATE_QA_ERROR"||publishStatus==="PUBLIC_ERROR"?"PARTIAL":"SUCCESS",
      "본조사 이전 "+prelaunch+"건 제외; 시각 불명 "+undated+"건 보류; 기타·미등록 보기 검수 "+reviewRows.length+"건; 전국 응답건수 "+publishStatus+" · 비공개 자동검수 "+privateQaStatus]);
    Logger.log("Updated internal school summary: "+matched+" schools");
    return {privateQaStatus,publishStatus};
  }catch(e){
    const stamp=Utilities.formatDate(new Date(),BEAGU26.timezone,"yyyy-MM-dd HH:mm:ss");
    if(destination)destination.getSheetByName(BEAGU26.logTab).appendRow([stamp,scanned,matched,unmatched,"ERROR",("사전응답 제외 "+prelaunch+"건; "+String(e.message||e)).slice(0,300)]);
    throw e;
  }finally{if(lock)lock.releaseLock();}
}

// BEGIN GENERATED 2026 QUESTION RESULTS
const BEAGU26_QUESTION_CATALOG={"Q01":{"question":"교직원 친목·체육·회식에 참여하지 않겠다는 선택이 자연스럽게 받아들여진다.","kind":"choice","options":["전혀 그렇지 않다","그렇지 않다","보통이다","그렇다","매우 그렇다","판단하기 어렵다"],"rows":[],"columns":[],"description":"관련 활동이 없거나 활동별 차이가 커서 판단하기 어려우면 ‘판단하기 어렵다’를 선택해 주세요."},"Q02":{"question":"연가·조퇴를 사용할 때 관리자에게 직접 찾아가 보고해야 한다.","kind":"choice","options":["전혀 그렇지 않다","그렇지 않다","보통이다","그렇다","매우 그렇다","판단하기 어렵다"],"rows":[],"columns":[],"description":""},"Q03":{"question":"병가 사용 시 정해진 복무 절차 외의 허락을 받거나 사용 자제를 요구받는다.","kind":"choice","options":["전혀 그렇지 않다","그렇지 않다","보통이다","그렇다","매우 그렇다","판단하기 어렵다"],"rows":[],"columns":[],"description":""},"Q04":{"question":"관리자나 다수와 다른 의견을 말하면 불이익이나 관계상의 압박이 걱정된다.","kind":"choice","options":["전혀 그렇지 않다","그렇지 않다","보통이다","그렇다","매우 그렇다","판단하기 어렵다"],"rows":[],"columns":[],"description":""},"Q05":{"question":"수업·평가·학급 운영에서 전문적 판단보다 기존 관행을 따르도록 요구받는다.","kind":"choice","options":["전혀 그렇지 않다","그렇지 않다","보통이다","그렇다","매우 그렇다","판단하기 어렵다"],"rows":[],"columns":[],"description":""},"Q06":{"question":"업무·보직 배정 기준이 구성원에게 공유되어 있다.","kind":"choice","options":["전혀 그렇지 않다","그렇지 않다","보통이다","그렇다","매우 그렇다","판단하기 어렵다"],"rows":[],"columns":[],"description":""},"Q07":{"question":"업무·보직 배정 기준이 사람에 따라 달라지지 않고 일관되게 적용된다.","kind":"choice","options":["전혀 그렇지 않다","그렇지 않다","보통이다","그렇다","매우 그렇다","판단하기 어렵다"],"rows":[],"columns":[],"description":"배정 기준을 모르거나 적용 사례를 알 수 없으면 ‘판단하기 어렵다’를 선택해 주세요."},"Q08":{"question":"신규·전입·저연차라는 이유만으로 특정 업무(학년·교과 교육과정 계획 포함)를 우선 맡긴다.","kind":"choice","options":["전혀 그렇지 않다","그렇지 않다","보통이다","그렇다","매우 그렇다","판단하기 어렵다"],"rows":[],"columns":[],"description":""},"Q09":{"question":"업무 배정이나 학교 운영 결정에 이의를 제기하면 조정·재검토를 받을 수 있다.","kind":"choice","options":["전혀 그렇지 않다","그렇지 않다","보통이다","그렇다","매우 그렇다","판단하기 어렵다"],"rows":[],"columns":[],"description":""},"Q10":{"question":"심각한 학부모 민원·갈등이 생기면 관리자 등 학교 차원에서 함께 대응한다.","kind":"choice","options":["전혀 그렇지 않다","그렇지 않다","보통이다","그렇다","매우 그렇다","판단하기 어렵다"],"rows":[],"columns":[],"description":"대응 사례를 알 수 없으면 ‘판단하기 어렵다’를 선택해 주세요."},"Q11":{"question":"교사 혼자 감당하기 어려운 학생지도 문제가 생기면 관리자 등이 함께 대응한다.","kind":"choice","options":["전혀 그렇지 않다","그렇지 않다","보통이다","그렇다","매우 그렇다","판단하기 어렵다"],"rows":[],"columns":[],"description":"대응 사례를 알 수 없으면 ‘판단하기 어렵다’를 선택해 주세요."},"Q12":{"question":"방학 중 교사 근무조·당번을 어떻게 운영합니까?","kind":"choice","options":["운영하지 않는다","희망자만 참여한다","희망과 관계없이 배정하지만 조정할 수 있다","희망과 관계없이 배정하고 조정하기 어렵다","잘 모르겠다","기타"],"rows":[],"columns":[],"description":"새학년 준비일, 개인 업무, 수업·연수 참여는 제외합니다. 2026 교직존중·수직성 지수 13문항에 포함됩니다."},"Q13":{"question":"성별·나이를 이유로 비공식 업무를 맡기는 일이 있습니까?","kind":"choice","options":["그런 일이 없다","요청은 있지만 자유롭게 거절할 수 있다","거절하면 눈치나 부담을 준다","사실상 거절하기 어렵다","판단하기 어렵다","기타"],"rows":[],"columns":[],"description":"행사 보조, 의자 정리, 제설, 다과 준비, 친목회 역할 등 정식 업무분장 외의 일입니다. 2026 교직존중·수직성 지수 13문항에 포함됩니다."},"Q14":{"question":"관계의 범위는 어느 쪽에 가깝습니까?","kind":"choice","options":["A에 매우 가깝다","A에 조금 가깝다","두 모습이 비슷하게 나타난다","B에 조금 가깝다","B에 매우 가깝다","해당하지 않거나 판단하기 어렵다"],"rows":[],"columns":[],"description":"A: 업무시간 안의 업무적 관계 중심 / B: 업무 밖의 친교까지 이어지는 관계"},"Q15":{"question":"의사결정은 어느 쪽에 가깝습니까?","kind":"choice","options":["A에 매우 가깝다","A에 조금 가깝다","두 모습이 비슷하게 나타난다","B에 조금 가깝다","B에 매우 가깝다","해당하지 않거나 판단하기 어렵다"],"rows":[],"columns":[],"description":"A: 구성원 간 합의를 충분히 만든 뒤 결정 / B: 관리자에게 판단 권한을 맡김. 사례마다 다르면 학교의 일반적인 방식으로 답해 주세요."},"Q16":{"question":"새로운 방식을 도입할 때 어느 쪽에 가깝습니까?","kind":"choice","options":["A에 매우 가깝다","A에 조금 가깝다","두 모습이 비슷하게 나타난다","B에 조금 가깝다","B에 매우 가깝다","해당하지 않거나 판단하기 어렵다"],"rows":[],"columns":[],"description":"A: 먼저 시도하면서 조정 / B: 충분히 검토한 뒤 도입"},"Q17":{"question":"수업·학급 운영 방식은 어느 쪽에 가깝습니까?","kind":"choice","options":["A에 매우 가깝다","A에 조금 가깝다","두 모습이 비슷하게 나타난다","B에 조금 가깝다","B에 매우 가깝다","해당하지 않거나 판단하기 어렵다"],"rows":[],"columns":[],"description":"A: 학년·학교가 공동으로 맞춤 / B: 교사마다 다르게 운영"},"Q18":{"question":"새학년 준비를 위해 지정된 출근일은 며칠입니까?","kind":"choice","options":["1일 이하","2~3일","4~5일","6~7일","8일 이상","잘 모르거나 당시 참여하지 않았다"],"rows":[],"columns":[],"description":"2026년 3월 1일 이전, 현재 학교가 본인에게 출근하도록 정한 날입니다. 회의 유무와 관계없이 세고 자율 출근은 제외합니다. 반일 출근도 1일입니다."},"Q19":{"question":"학교가 정한 통상적인 출근 시각을 알려 주세요.","kind":"time","options":[],"rows":[],"columns":[],"description":"예: 08:30. 본인이 실제 도착한 시각이나 통근 소요 시간이 아닙니다."},"Q20":{"question":"학교가 정한 통상적인 퇴근 시각을 알려 주세요.","kind":"time","options":[],"rows":[],"columns":[],"description":"예: 16:30. 본인이 실제 퇴근한 시각이나 통근 소요 시간이 아닙니다."},"Q21":{"question":"올해, 퇴근 후 또는 휴일 중에 업무연락을 받은 날은 며칠입니까?","kind":"choice","options":["0일","1일","2~3일","4~7일","8일 이상","잘 모르겠다"],"rows":[],"columns":[],"description":"2026년 현재 학교에서 실제 근무한 기간을 기준으로 답해 주세요. 학교 내부 전화·메신저 연락이며 같은 날 여러 번 받아도 1일입니다. 휴직 중 연락은 제외합니다."},"Q22":{"question":"현재 학교의 장기재직휴가 사용·승인 분위기는 어떻습니까?","kind":"grid","options":[],"rows":["자격을 갖춘 동료교사가 장기재직휴가를 실제로 사용한 사례가 있다","자격을 갖춘 교사는 주변의 눈치를 보지 않고 장기재직휴가를 신청할 수 있다","관리자는 정당한 운영상 사유가 없다면 장기재직휴가 신청을 승인한다"],"columns":["전혀 그렇지 않다","그렇지 않다","보통이다","그렇다","매우 그렇다","판단하기 어렵다"],"description":"2026학년도 현재 학교에서 직접 관찰하거나 공식적으로 확인한 사실을 기준으로 답해 주세요. 동료 사용 사례가 보이지 않더라도 대상자가 없거나 신청하지 않았다면 ‘판단하기 어렵다’를 선택합니다. 법령·교육청 지침에 따른 학사일정 조정이나 대체인력 확보를 위한 협의는 부당한 거부와 구분합니다. 행마다 판단이 어려우면 마지막 보기를 선택해 주세요."},"Q23":{"question":"담임교사인 본인의 주당 정규 수업 시수는 얼마입니까?","kind":"choice","options":["19시간 이하","20~21시간","22시간","23시간 이상","담임교사가 아니다","잘 모르겠다"],"rows":[],"columns":[],"description":"시간표상 수업 시수이며 보결·방과후 수업은 제외합니다."},"Q24":{"question":"담임교사인 본인이 한 달에 작성하는 공문은 몇 건입니까?","kind":"choice","options":["월평균 1건 미만","월평균 1~2건","월평균 3~5건","월평균 6건 이상","담임교사가 아니다","잘 모르겠다"],"rows":[],"columns":[],"description":"2026학년도 근무한 달의 평균입니다. 내부결재·대외발송 기안 포함, 단순 열람·결재·자료 입력·제출 제외."},"Q25":{"question":"담임 학급의 정기 성적표 안내는 연간 몇 회입니까?","kind":"choice","options":["0~1회","2회","3회","4회 이상","담임교사가 아니다","잘 모르겠다"],"rows":[],"columns":[],"description":"학교가 정한 정기적인 평가 결과 안내·통지 횟수입니다. 시험지 반환이나 수시 상담·연락은 제외합니다."},"Q26":{"question":"현재 학교에서 교사가 담당하는 행정업무를 모두 선택해 주세요.","kind":"multi","options":["교과서 구입","물품 구입","예산 품의","강사 채용","강사 급여 관리","방과후 자유수강권 관리","학생 통신비 지원","학교운영위원회 운영","정보공시","평생교육","민방위훈련","유무선 네트워크 관리","전산실 관리","하드디스크 파기","업무 메신저 관리","학교 홈페이지 관리","CCTV 관리","정보기기 관리·불용처리(프린터 제외)","프린터 관리","위 업무 중 교사가 담당하는 업무가 없다","잘 모르겠다"],"rows":[],"columns":[],"description":"본인이 맡지 않더라도 교사 중 누군가 실제 담당하면 선택하세요. 행정실·교육공무직·외부업체만 맡는 업무는 제외. 해당 없음·잘 모르겠다는 다른 항목과 함께 선택하지 마세요."},"Q27":{"question":"다음 업무·복무 관행이 있습니까?","kind":"grid","options":[],"rows":["주간학습안내를 정기적으로 작성한다","주간학습안내에 관리자 결재를 받는다","조퇴 결재선에 학년부장이 포함된다","학교가 정한 토요일 근무가 있다","교사가 교문 교통지도·주차지도를 맡는다"],"columns":["있다","없다","잘 모르겠다"],"description":"토요일 근무는 정기·비정기 포함, 자율 출근 제외. 주간학습안내를 작성하지 않으면 관리자 결재도 ‘없다’로 답하세요. 특정 행이 수직성의 구조적 단서를 제공해도 그리드 전체를 수직성 점수에 합산하지 않습니다."},"Q28":{"question":"학부모 민원은 주로 누가 처음 대응합니까?","kind":"choice","options":["담임교사","담임교사와 부장교사 등","관리자나 별도 담당팀","사안에 따라 크게 다르다","잘 모르겠다","기타"],"rows":[],"columns":[],"description":"학부모가 교사나 학교에 불만·문제를 제기했을 때 최초 대응 주체입니다."},"Q29":{"question":"현재 학교에서 하이톡을 교사들이 사용하는 방식은 어느 쪽에 가깝습니까?","kind":"choice","options":["하이톡을 사용하지 않거나 학교에 도입되어 있지 않다","일부 교사가 자발적으로 사용하고, 다른 교사는 다른 방식으로 소통한다","대부분의 교사가 자발적으로 사용하며, 사용하지 않아도 불이익이 없다","많은 교사가 사용하며, 사용하지 않으면 동료 사이에 눈치나 부담이 있다","학교·관리자의 권고로 사용하며, 원하지 않을 때 거절하기 어렵다","학교에서 공식 소통수단으로 지정하여 사용하고 있다(개인별 자율성은 판단하기 어렵다)","동료교사들의 사용 현황을 잘 모르겠다","기타"],"rows":[],"columns":[],"description":"하이톡은 하이클래스의 교사·학부모 1:1 채팅 기능을 뜻합니다. 학교 차원의 공식 운영 여부와 동료교사의 자발적인 이용을 구분해 주세요. 다른 소통 앱을 이용하는 학교는 첫 번째 보기를 선택합니다. 공식 소통수단 지정 자체를 부당한 강요로 해석하지 않습니다."},"Q30":{"question":"수업 중 학생 분리가 필요하면 어떻게 대응합니까?","kind":"choice","options":["다른 담당자가 맡아 교사는 수업을 계속한다","다른 담당자가 맡지만 일관되지는 않다","분리해도 수업하는 교사가 함께 맡아야 한다","분리할 여건이 없어 수업 교사가 교실에서 대응한다","경험이 없거나 판단하기 어렵다","기타"],"rows":[],"columns":[],"description":"수업을 계속하기 어려울 정도의 학생지도 상황에서 실제로 이루어진 대응을 기준으로 답해 주세요."},"Q31":{"question":"올해 교권침해와 관련해 병가를 쓰거나 퇴직한 교사가 있습니까?","kind":"choice","options":["있는 것으로 알고 있다","없는 것으로 알고 있다","잘 모르겠다"],"rows":[],"columns":[],"description":"2026학년도 현재 학교에서 직접 확인한 범위만 답해 주세요. 소문으로 판단하지 마세요. 이 응답은 학교별로 공개하거나 존중지수에 합산하지 않습니다."},"Q32":{"question":"다음 학교 조직·운영 체계 및 사업이 있습니까?","kind":"grid","options":[],"rows":["학부모 민원 1차 대응팀","수업이 적거나 없는 교사로 구성된 업무전담팀","학교 대표번호에 응대하는 담당자·체계","늘봄실장","외부인 출입 통제","학부모 등 방문예약제","IB 등 공모·지정 사업을 현재 운영한다"],"columns":["있다","없다","잘 모르겠다"],"description":"조직과 공식 운영 절차, IB 등 공모·지정 사업의 현재 운영 여부를 확인합니다. 판단하기 어려운 항목은 ‘잘 모르겠다’를 선택해 주세요."},"Q33":{"question":"학생을 지원하는 조직·인력·프로그램이 있습니까?","kind":"grid","options":[],"rows":["위기학생 지원","특수교육 대상 학생 지원","다문화학생 지원"],"columns":["있다","없다","대상 학생이 없다","잘 모르겠다"],"description":"교사 개인의 일상적 지도만 있으면 ‘없다’입니다. 대상 학생이 없어도 지원 체계가 있으면 ‘있다’입니다."},"Q34":{"question":"담임 학급의 올해 교외 체험학습은 몇 회입니까?","kind":"choice","options":["0회","1회","2회","3회 이상","담임교사가 아니다","잘 모르겠다"],"rows":[],"columns":[],"description":"2026학년도 실시 또는 일정 확정된 교외 체험학습입니다. 수학여행·숙박체험 포함, 연속 일정은 1회입니다. 정기적 교외 수업은 제외합니다."},"Q35":{"question":"올해 학교에서 운영한 학생·학부모 대상 행사·활동·단체를 모두 선택해 주세요.","kind":"multi","options":["교장 훈화가 있는 전교생 방송조회","교장 훈화가 있는 전교생 집합조회","학교 운동회·체육대회","학예 발표회·학교축제","공개 수업","교내 대회","당일 현장체험학습","수학여행·기타 숙박체험","당일 수련활동","숙박 수련활동","교외 생존수영","교내 생존수영","바자회","학생 자치회","학생회 선거","학생 동아리","청소년단체(스카우트, 아람단)","상담 주간","학부모 총회","그 밖의 학부모 초청 행사","학부모회 운영","녹색학부모회 운영","학생 운동부 운영","위 항목에 해당하는 행사·활동이 없다","잘 모르겠다"],"rows":[],"columns":[],"description":"2026학년도 실시했거나 일정 확정된 행사, 실제 운영 중인 단체·활동 중 확인한 항목을 모두 선택해 주세요. ‘운영’ 항목은 단체가 존재하고 실제 활동하는 경우 선택합니다. 해당 없음·잘 모르겠다는 다른 항목과 함께 선택하지 마세요."},"Q36":{"question":"올해 학교에서 운영한 교직원 대상 행사·모임·단체를 모두 선택해 주세요.","kind":"multi","options":["교직원 친목회 운영","친목회 행사","그 밖의 교직원 동아리","교직원 친목 목적 숙박여행","교육과정 워크숍","숙박을 포함한 업무 워크숍·연수","상조회","위 항목에 해당하는 행사·활동이 없다","잘 모르겠다"],"rows":[],"columns":[],"description":"2026학년도 실시했거나 일정이 확정된 행사 및 실제 운영된 교직원 모임·단체 중 확인한 항목을 선택하세요. 친목회 운영 여부와 친목회 행사 개최 여부는 구분합니다. 스포츠 종목은 다음 문항에서 별도로 조사합니다. 해당 없음·잘 모르겠다는 다른 항목과 함께 선택하지 마세요."},"Q37":{"question":"올해 학교에서 운영한 교직원 스포츠활동의 종목을 모두 선택해 주세요.","kind":"multi","options":["배구","피클볼","탁구","배드민턴","등산·트레킹","걷기·러닝","축구·풋살","족구","농구","테니스","볼링","요가·필라테스","그 밖의 스포츠 종목","교직원 스포츠활동을 운영하지 않는다","잘 모르겠다"],"rows":[],"columns":[],"description":"2026학년도 학교에서 실시한 스포츠 모임·동아리·교직원 대상 행사 중 아는 종목을 모두 선택하세요. 근무시간 안팎, 학교 주최 및 교직원 자율 모임을 포함하고 개인적으로만 하는 운동은 제외합니다. 1회성이라도 실제 운영했다면 포함합니다. ‘운영하지 않는다’와 ‘잘 모르겠다’는 다른 종목과 함께 선택하지 마세요. 스포츠 종목의 존재와 참여 강제성은 별개의 문제이며, 참여의 자유는 필수 Q01에서 조사합니다."},"Q38":{"question":"근무 중 업무에서 벗어나 잠시 쉴 수 있습니까?","kind":"choice","options":["필요할 때 잠시 쉴 수 있다","공간은 있지만 업무 때문에 쉬기 어렵다","업무 여유는 있지만 쉴 공간이 부족하다","업무와 공간 문제로 쉬기 어렵다","다른 이유로 쉬기 어렵다","판단하기 어렵다"],"rows":[],"columns":[],"description":"휴게실 유무와 별개로 실제 잠시 쉴 수 있는 여건을 묻습니다. 시설·환경 및 근무여건 분석 항목이며 수직성 점수에는 넣지 않습니다."},"Q39":{"question":"출근할 때 주차 공간은 어떻습니까?","kind":"choice","options":["거의 부족하지 않다","가끔 부족하다","자주 부족하다","교내에 주차할 수 없다","자동차로 출근하지 않는다","잘 모르겠다"],"rows":[],"columns":[],"description":"시설·환경 항목입니다. 자동차로 출근하지 않으면 별도의 보기를 선택하세요."},"Q40":{"question":"다음 급식·복지·관행이 있습니까?","kind":"grid","options":[],"rows":["우유급식","교실급식","학교 예산으로 교직원 다과·간식을 지원한다","교직원이 다과비·간식비를 의무적으로 부담한다","졸업앨범에 교사 사진을 싣는다"],"columns":["있다","없다","잘 모르겠다"],"description":"자유 참여하는 공동 구매는 의무 부담에서 제외합니다. 예산 지원과 의무 부담이 함께 있으면 두 행 모두 ‘있다’로 답하세요."},"Q41":{"question":"학교가 제공하는 개인 업무용 물품은 어떻습니까?","kind":"grid","options":[],"rows":["교사용 데스크톱 PC","듀얼 모니터 환경","교사용 노트북","개인 사물함"],"columns":["개인별로 제공","공동으로 제공","제공하지 않음","잘 모르겠다"],"description":"학교 제공 물품만 답해 주세요. 듀얼 모니터는 본인 컴퓨터에 동시에 쓰는 두 화면이며 노트북 화면 포함. 수업용 TV·전자칠판 제외. 시설·환경 항목입니다."},"Q42":{"question":"학교의 교직원 공간·복지시설 이용 현황은 어떻습니까?","kind":"grid","options":[],"rows":["교사 휴게실","학년 연구실","전담 연구실","교직원 화장실","탕비 공간","학습준비물실","샤워 공간","수유 공간","체력단련실","교직원 식당","학부모 상담실","학생 상담실(Wee클래스 제외)","Wee클래스","교직원이 이용할 수 있는 전기차 충전시설","엘리베이터"],"columns":["전용 공간으로 이용 가능","다른 용도와 함께 쓰지만 이용 가능","공간은 있으나 이용하기 어려움","공간 없음","잘 모르겠다"],"description":"현재 주로 근무하는 건물·캠퍼스 기준. ‘전용’은 해당 기능을 위한 독립 공간입니다. 학부모 상담실에는 민원상담 공간을 포함합니다. 학생 상담실과 Wee클래스는 별도 조사합니다."},"Q43":{"question":"교실에 배치된 기기는 무엇입니까?","kind":"multi","options":["TV","전자칠판","공기청정기","냉난방기","선풍기","에어컨바람막이"],"rows":[],"columns":[],"description":"현재 주로 수업하는 교실 기준, 개인 소유 기기 제외. 빈칸은 기기가 없다는 뜻이 아닌 ‘미확인’으로 처리합니다."},"Q44":{"question":"냉난방과 화장실 온수 사용은 어떻습니까?","kind":"multi","options":["냉방","난방","온수"],"rows":[],"columns":[],"description":"주요 근무 공간의 냉방·난방과 자주 이용하는 화장실 온수 중 실제 사용 가능한 항목을 모두 선택하세요. 빈칸은 ‘미확인’으로 처리합니다."},"Q45":{"question":"교직원이 학교의 비품·통신시설을 이용할 수 있는 공간은 어디입니까?","kind":"grid","options":[],"rows":["일반 정수기(얼음 기능 없음)","얼음정수기","냉장고","전자레인지","커피머신","안마의자","운동 기구","흑백 전용 프린터(복합기 제외)","컬러프린터(복합기 제외)","복합기","와이파이(안정적으로 연결되는 공간)","와이파이(연결이 자주 끊기거나 불안정한 공간)","녹음 가능한 학교 제공 업무용 전화"],"columns":["교무실·행정실","학년 연구실","교실","그 밖의 교내 공간","이용 가능한 비품·통신시설 없음","잘 모르겠다"],"description":"각 행에 대해 실제 이용 가능한 위치를 모두 선택해 주세요. 개인 소유 비품·휴대전화는 제외합니다. 와이파이는 연결이 안정적인 공간과 불안정한 공간을 구분하여 답합니다. 학교 제공 업무용 전화는 통화 녹음 기능이 실제로 제공되는 경우에만 위치를 선택합니다. 녹음 가능한 전화가 있지만 접근하기 어렵다면 ‘이용 가능한 비품·통신시설 없음’을 선택하고, 확인하지 못했다면 ‘잘 모르겠다’를 선택해 주세요. ‘이용 가능한 비품·통신시설 없음’과 ‘잘 모르겠다’는 같은 행의 다른 위치 보기와 함께 고르지 마세요. 시설·통신환경을 한 번에 응답하므로 수정4 Q28·Q29의 응답 보기와 직접 등치시키지 않습니다."},"Q46":{"question":"다음 학년도에 예정된 변경이 있습니까?","kind":"grid","options":[],"rows":["교장 변경","교감 변경","학교 이전","건물 공사","시설 개선","업무분장 체계 개편","조직·팀 구성 개편"],"columns":["변경 예정","변경 없음으로 확인","미정·잘 모르겠다","해당 없음"],"description":"2027학년도 공식 안내·확인된 계획만 답해 주세요. 업무분장 개편은 단순 담당자 교체를 제외합니다."},"Q47":{"question":"다음 학년도 규모는 어떻게 바뀔 예정입니까?","kind":"grid","options":[],"rows":["학급 수","학생 수","교원 수"],"columns":["증가 예정","유지 예정","감소 예정","잘 모르겠다"],"description":"학급 증설·감축은 학급 수 증가·감소에 포함합니다."},"Q48":{"question":"다음 학년도 지정·운영 사업 계획은 무엇입니까?","kind":"grid","options":[],"rows":["연구학교","혁신학교","IB 운영","기타 사업 진행 학교"],"columns":["새로 시작","계속 운영(단계 변경 포함)","운영 종료","현재도 없고 도입 계획도 없음","미정·잘 모르겠다"],"description":"IB 관심·후보·인증 단계 변화는 계속 운영에 포함합니다. 기타 사업은 학교가 공식 지정·운영하는 별도 사업을 뜻합니다. ‘IB 등 공모·지정 사업’의 운영 여부는 이 문항의 연구학교·혁신학교·IB·기타 사업 행에서 통합 확인합니다."},"Q49":{"question":"현재 학교에 대한 종합평가를 알려 주세요.","kind":"grid","options":[],"rows":["전반적으로 현재 학교에서 근무하는 데 만족한다","개인적인 이동 사정을 제외하면 현재 학교에서 계속 근무하고 싶다"],"columns":["전혀 그렇지 않다","그렇지 않다","보통이다","그렇다","매우 그렇다","판단하기 어렵다"],"description":"두 문장은 각각 독립적으로 평가해 주세요. 두 번째 문장은 거주지·가족·통근·의무전보 등 개인적인 이동 사정을 제외하고 답해 주세요. 해당 학교에서 실제 근무한 경험을 기준으로 답합니다."},"Q50":{"question":"현재 학교에 대한 만족도나 계속 근무할 의사를 판단할 때 가장 중요하게 고려하는 요소는 무엇입니까?","kind":"choice","options":["교직문화(복무 자율성·업무분장·학교 관행)","관리자(교장·교감의 리더십과 교사 지원)","동료교사(협력·관계·갈등)","거주지·가족·통근 여건","승진가산점·인사상 이익","학생(생활지도·수업 여건)","학부모(소통·민원·협력)","업무량·업무 강도·수업 시수","시설·복지·휴식 환경","그 밖의 요인","가장 중요한 한 가지를 고르기 어렵다"],"rows":[],"columns":[],"description":"마지막 객관식 질문입니다. 좋거나 나쁜 방향에 관계없이, 현재 학교에 대한 평가나 계속 근무할지의 판단에 가장 크게 작용하는 한 가지를 선택해 주세요. 비슷한 요소가 여럿이라도 가장 크게 영향을 주는 것 하나만 골라 주세요. 학교의 실제 상태와 개인의 중요도는 다를 수 있습니다."}};
/* Pure aggregate builder. Input stays in the private spreadsheet runtime.
 * Output contains school IDs and closed-option counts, never response records. */
function beagu26CleanOption(value) {
  return String(value || '').replace(/(^|,\s*)[①-⑳㉑-㉟㊱-㊿]\s*/g, '$1').normalize('NFKC').replace(/\s+/g, ' ').trim();
}
function beagu26Selections(value, options, multiple) {
  const raw=String(value||'').trim();
  if(!raw)return [];
  const normalized=beagu26CleanOption(raw);
  const exact=options.findIndex(v=>beagu26CleanOption(v)===normalized);
  if(exact>=0)return [exact];
  if(!multiple)return null;
  // Google Forms separates checkbox choices by comma+space. Some labels also
  // contain commas; consume complete whitelist labels, longest match first.
  let rest=raw, found=[];
  const candidates=options.map((v,i)=>({i,v:beagu26CleanOption(v)})).sort((a,b)=>b.v.length-a.v.length);
  while(rest){
    rest=beagu26CleanOption(rest);
    const hit=candidates.find(x=>rest===x.v||rest.startsWith(x.v+', '));
    if(!hit||found.includes(hit.i))return null;
    found.push(hit.i);rest=rest.slice(hit.v.length).replace(/^,\s*/, '');
  }
  return found.sort((a,b)=>a-b);
}
// Private row-level triage, not proof of distinct respondents or consent.
// Only identical second-level timestamps and all 13 identical mandatory
// selections at the same uniquely matched school are duplicate suspects.
// Never remove rows on suspicion, persist fingerprints or export them.
function beagu26RowReviewSignals(values,c,schools) {
  const signals=new Map(),seen=new Map();
  if(!Array.isArray(c.q)||c.q.length!==13)return signals;
  const add=(i,reason)=>{
    if(!signals.has(i))signals.set(i,new Set());
    signals.get(i).add(reason);
  };
  for(let i=1;i<values.length;i++){
    const r=values[i],day=getSubmittedDay(r[0]);
    if(!day||day<'2026-11-01'||day>'2026-12-31')continue;
    const match=resolveSchool(r,c,schools);
    if(!match.school)continue;
    if(match.typeConflict)add(i,'SCHOOL_TYPE_REVIEW');
    const core=c.q.map(j=>String(r[j]||'').trim());
    if(core.some(v=>!v))add(i,'MANDATORY_MISSING');
    const stamp=String(r[0]||'').trim();
    if(core.some(v=>!v)||! /\d{1,2}:\d{2}:\d{2}(?:\s|$)/.test(stamp))continue;
    const key=JSON.stringify([String(match.school.school_id),stamp,...core]);
    if(seen.has(key)){add(seen.get(key),'DUPLICATE_SUSPECT');add(i,'DUPLICATE_SUSPECT');}
    else seen.set(key,i);
  }
  return signals;
}
function beagu26BuildResults(values, schools, catalog) {
  const headers=values[0], c=questionColumns(headers), specs=[];
  for(const id of Object.keys(catalog)){
    const meta=catalog[id], hits=[];
    headers.forEach((h,col)=>{if(String(h).startsWith(id+'.'))hits.push(col);});
    const expected=meta.kind==='grid'?meta.rows.length:1;
    if(hits.length!==expected)throw Error(id+' column count mismatch');
    hits.forEach((col,index)=>{
      if(meta.kind==='grid'){
        const label=beagu26CleanOption(String(headers[col]).match(/\[([^\]]+)\]\s*$/)?.[1]);
        const expectedLabel=beagu26CleanOption(meta.rows[index]);
        // Owner confirmed 2026-11-23 evening (KST) wording-only change.
        // Exact historical aliases at these two row positions, no other drift.
        const historicalAlias=id==='Q45'&&(
          (index===10&&label==='교사용 와이파이(안정적으로 연결되는 공간)'&&expectedLabel==='와이파이(안정적으로 연결되는 공간)')||
          (index===11&&label==='교사용 와이파이(연결이 자주 끊기거나 불안정한 공간)'&&expectedLabel==='와이파이(연결이 자주 끊기거나 불안정한 공간)')
        );
        if(label!==expectedLabel&&!historicalAlias)throw Error(id+' grid row mismatch');
      }
      specs.push({id,row:meta.kind==='grid'?index:-1,col,
        options:meta.kind==='grid'?meta.columns:meta.options,
        multiple:meta.kind==='multi'||id==='Q45',time:meta.kind==='time'});
    });
  }
  const signals=beagu26RowReviewSignals(values,c,schools);
  const groups=new Map(), reviewRows=[], totals={source_rows:0,official_rows:0,prelaunch_rows:0,unmatched_rows:0,undated_rows:0};
  for(let sourceIndex=1;sourceIndex<values.length;sourceIndex++){
    const r=values[sourceIndex];
    if(!r[0]&&!r[c.school])continue;
    totals.source_rows++;
    const day=getSubmittedDay(r[0]);
    if(!day){totals.undated_rows++;continue;}
    if(day<'2026-11-01'){totals.prelaunch_rows++;continue;}
    if(day>'2026-12-31'){totals.undated_rows++;continue;}
    totals.official_rows++;
    const match=resolveSchool(r,c,schools);
    if(!match.school){totals.unmatched_rows++;continue;}
    const id=String(match.school.school_id);
    if(!groups.has(id))groups.set(id,{school_id:id,school_response_rows:0,school_match_status:'EXACT_REGION_OFFICE_NAME',
      questions:specs.map(s=>({id:s.id,row:s.row,valid:0,invalid:0,counts:s.options.map(()=>0),minutes_sum:0}))});
    const g=groups.get(id);g.school_response_rows++;
    const rowSignals=signals.get(sourceIndex)||new Set();
    if(match.typeConflict||rowSignals.has('DUPLICATE_SUSPECT')||rowSignals.has('MANDATORY_MISSING'))g.school_match_status='NEEDS_REVIEW';
    for(const reason of rowSignals)reviewRows.push([sourceIndex+1,id,'ROW',-1,reason,'PENDING_REVIEW']);
    specs.forEach((s,index)=>{
      const q=g.questions[index], raw=String(r[s.col]||'').trim();
      if(!raw)return;
      if(s.time){
        const m=/^(?:(오전|오후)\s*)?(\d{1,2}):(\d{2})(?::00)?$/.exec(raw);
        let hour=Number(m?.[2]),minute=Number(m?.[3]);
        if(!m||minute>59||hour>23||(m[1]&&(hour<1||hour>12))){
          q.invalid++;
          reviewRows.push([sourceIndex+1,id,s.id,s.row,'INVALID_TIME','PENDING_REVIEW']);
          return;
        }
        if(m[1])hour=hour%12+(m[1]==='오후'?12:0);
        q.valid++;q.minutes_sum+=hour*60+minute;return;
      }
      const selected=beagu26Selections(raw,s.options,s.multiple);
      // '기타' and unknown labels stay in the source sheet for human review.
      // Review rows contain pointers only; never free-text values or identities.
      const containsOther=selected!==null&&selected.some(i=>beagu26CleanOption(s.options[i])==='기타');
      if(selected===null||containsOther){
        q.invalid++;
        reviewRows.push([sourceIndex+1,id,s.id,s.row,containsOther?'OTHER_OPTION':'UNKNOWN_OPTION','PENDING_REVIEW']);
        return;
      }
      if(selected.length){q.valid++;selected.forEach(i=>q.counts[i]++);}
    });
  }
  return {source_spreadsheet_id:BEAGU26.sourceId,official_start_day:'2026-11-01',schema_version:1,
    totals,schools:[...groups.values()].sort((a,b)=>a.school_id.localeCompare(b.school_id)),reviewRows};
}

function readBeagu2026SourceSnapshot() {
  const startedAt=new Date().toISOString();
  const source=SpreadsheetApp.openById(BEAGU26.sourceId).getSheetByName(BEAGU26.sourceTab);
  if(!source)throw Error('원본 응답 탭 없음');
  const headers=source.getRange(1,1,1,source.getLastColumn()).getDisplayValues()[0];
  const last=headers.findIndex(h=>/^Q50\./.test(String(h)));
  const rowCount=source.getLastRow();
  if(last<0||rowCount>BEAGU26.maxResponses+1)throw Error('원본 열·행 안전 검사 실패');
  // Never read Q51 or later free-text response cells.
  const values=source.getRange(1,1,Math.max(1,rowCount),last+1).getDisplayValues();
  const schools=fetchSchools();
  if(!schools.length)throw Error('학교 MASTER 비어 있음');
  beagu26PrepareSchoolIndex(schools);
  // Optional audit only. A stale or absent historical row cannot force a match
  // or prevent the normal exact current-directory aggregation.
  try {
    const master=SpreadsheetApp.openById(BEAGU26.destinationId);
    const prior=master.getSheetByName('2026_학교매칭_재검증_1124');
    const holds=master.getSheetByName(BEAGU26.holdTab);
    if(prior&&holds&&prior.getLastRow()>1&&holds.getLastRow()>1){
      const result=beagu26AuditPriorExactMatches(values,schools,
        prior.getRange(2,1,prior.getLastRow()-1,7).getDisplayValues(),
        holds.getRange(2,1,holds.getLastRow()-1,6).getDisplayValues());
      Logger.log('BEAGU26_PRIOR_MATCH_AUDIT '+JSON.stringify(result));
    }
  } catch(e){Logger.log('BEAGU26_PRIOR_MATCH_AUDIT unavailable');}
  return {startedAt,values,schools};
}
function refreshBeagu2026QuestionResults(snapshot) {
  const lock=snapshot?null:LockService.getScriptLock();
  if(lock&&!lock.tryLock(30000))throw Error('질문별 집계 실행 중');
  try {
    const {startedAt,values,schools}=snapshot||readBeagu2026SourceSnapshot();
    const {reviewRows, ...payload}=beagu26BuildResults(values,schools,BEAGU26_QUESTION_CATALOG);
    payload.snapshot_at=startedAt;
    const master=SpreadsheetApp.openById(BEAGU26.destinationId);
    const tab=master.getSheetByName('2026_문항별_검수대기')||master.insertSheet('2026_문항별_검수대기');
    const columns=['학교ID','문항','하위문항번호','선택응답수','검증불가수','보기별빈도_JSON','시각합계_분','학교매칭','공개상태'];
    tab.getRange(1,1,1,columns.length).setValues([columns]);
    const rows=[];
    payload.schools.forEach(s=>s.questions.forEach(q=>rows.push([s.school_id,q.id,q.row,q.valid,q.invalid,JSON.stringify(q.counts),q.minutes_sum,s.school_match_status,'WITHHELD'])));
    replaceBody(tab,rows,columns.length);
    const review=master.getSheetByName('2026_전문항_기타_검수대기')||master.insertSheet('2026_전문항_기타_검수대기');
    const reviewHeaders=['원본행번호','학교ID','문항','하위문항번호','검수유형','집계상태'];
    review.getRange(1,1,1,reviewHeaders.length).setValues([reviewHeaders]);
    replaceBody(review,reviewRows,reviewHeaders.length);
    const secret=PropertiesService.getScriptProperties().getProperty('BEAGU_2026_INGEST_TOKEN')||'';
    if(secret.length<32)throw Error('BEAGU_2026_INGEST_TOKEN 설정 필요');
    const response=UrlFetchApp.fetch(BEAGU26.supabaseUrl+'/functions/v1/beagu-2026-results-ingest',{
      method:'post',contentType:'application/json',headers:{'X-Beagu-Ingest-Token':secret},
      payload:JSON.stringify(payload),muteHttpExceptions:true
    });
    if(response.getResponseCode()!==200)throw Error('비공개 문항 집계 전송 실패 HTTP '+response.getResponseCode());
    Logger.log('비공개 문항 집계 저장: 학교 '+payload.schools.length+'개. 공개 승인은 별도입니다.');
    return {basicReviewRows:new Set(reviewRows.map(r=>r[0])).size};
  } finally {if(lock)lock.releaseLock();}
}
