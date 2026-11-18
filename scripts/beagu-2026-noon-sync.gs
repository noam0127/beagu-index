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
function refreshBeagu2026AllPrivateStats() {
  refreshBeagu2026Stats();
  if(typeof refreshBeagu2026SchoolCulture==="function") {
    refreshBeagu2026SchoolCulture();
  } else {
    Logger.log("Q14~Q17 학교문화 자동 집계 미설치: MBTI 스크립트 파일을 추가하세요.");
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
 * Owner-run setup. This must execute inside the original Google Apps Script
 * project with the owner's OAuth approval. GitHub commits do not install it.
 * Never print or transmit the secret values in the log.
 */
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
  return String(s||"").replace(/[①-⑳]/g,"").normalize("NFKC").replace(/[\s,.'"“”\[\]()/\\\-]/g,"").trim();
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
  const value=normalize(s).replace(/^[①-⑳]/,"")
    .replace(/서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전북특별자치도|전라북도|전라남도|경상북도|경상남도|제주특별자치도/g,"");
  // normalize() removes parentheses before matching. Form may say '마산교육청'/'진해교육청' while the master stores
  // '창원교육지원청(마산센터)' or '(진해센터)'. Match the surveyed area,
  // never collapse all three areas into the single parent office.
  if(/^창원교육지원청마산센터$/.test(value)||/^마산(?:교육지원청|교육청|센터)?(?:폐지)?$/.test(value))return "마산";
  if(/^창원교육지원청진해센터$/.test(value)||/^진해(?:교육지원청|교육청|센터)?(?:폐지)?$/.test(value))return "진해";
  if(/^창원(?:교육지원청|교육청)?(?:본청|폐지)?$/.test(value))return "창원";
  return value.replace(/교육지원청|교육청/g,"");
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
    if(idx<0)throw Error("Q"+code+" 확인되지 않은 보기: "+s.slice(0,45));
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
    if(!Object.prototype.hasOwnProperty.call(opts,s))throw Error("Q12 보기 불일치: "+s.slice(0,45));
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
    if(!Object.prototype.hasOwnProperty.call(opts,s))throw Error("Q13 보기 불일치: "+s.slice(0,45));
    return opts[s];
  }
  return null;
}
function resolveSchool(row,c,schools) {
  const schoolName=normalize(row[c.school]);
  const region=regionOf(row[c.region]);
  const officeNames=c.office.map(i=>String(row[i]||"").trim()).filter(Boolean);
  if(!schoolName||!region||officeNames.length!==1)return {error:"학교·지역·교육지원청 필수값 누락 또는 중복"};
  const office=normalizeOffice(officeNames[0]);
  if(!office)return {error:"교육지원청을 식별할 수 없음"};
  const same=schools.filter(s=>regionOf(s.sido_standard)===region
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
function refreshBeagu2026Stats() {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(30000))throw Error("이미 다른 집계가 실행 중입니다.");
  let scanned=0,matched=0,unmatched=0,prelaunch=0,undated=0;
  const destination=SpreadsheetApp.openById(BEAGU26.destinationId);
  try{
    const source=SpreadsheetApp.openById(BEAGU26.sourceId).getSheetByName(BEAGU26.sourceTab);
    if(!source)throw Error("원본 응답 시트 이름이 변경되었습니다.");
    const rCount=source.getLastRow();
    if(rCount>BEAGU26.maxResponses+1)throw Error("응답 행수 안전 한도 초과");
    // B01/B02/B03 and Q01~Q13 are in the leading columns; avoid loading free-text answers.
    const values=source.getRange(1,1,Math.max(1,rCount),Math.min(50,source.getLastColumn())).getDisplayValues();
    const columns=questionColumns(values[0]);
    const schools=fetchSchools(); // 학교 MASTER가 없으면 기존 결과 보존
    const groups=new Map(),holds=[];
    for(let i=1;i<values.length;i++){
      const r=values[i];
      if(!r[0]&&!r[columns.school])continue;
      scanned++;
      const submittedDay=getSubmittedDay(r[0]);
      // Never mix pilot/prelaunch and official 2026 survey responses.
      if(submittedDay && submittedDay<BEAGU26.firstOfficialResponseDay){prelaunch++;continue;}
      if(!submittedDay){undated++;unmatched++;holds.push([i+1,"","","","응답 시각 확인 불가","NEEDS_REVIEW"]);continue;}
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
      for(let j=0;j<13;j++)scores.push(questionScore(j+1,r[columns.q[j]]));
      let g=groups.get(key);
      if(!g){g={school:m.school,counts:Array(13).fill(0),sums:Array(13).fill(0),rows:0,viScores:[],typeConflict:false};groups.set(key,g)}
      g.typeConflict ||= m.typeConflict;
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
      return [String(s.school_id),s.sido_standard,s.support_office,s.school_name,g.rows,...avg,vi,"",g.typeConflict?"NEEDS_TYPE_REVIEW":"PENDING_VERIFICATION",now,g.typeConflict?"설립유형 응답과 공시정보 불일치 · 내부 참고값만 보관 · 학교유형·공개동의 검수 대기":"원자료 재집계(비공개) · 공식 2026 백분위 산식/공개 검수 대기"];
    });
    // 원본 데이터와 학교 매칭 오류 검사를 모두 마친 뒤에만 결과 시트를 갱신한다.
    replaceBody(destination.getSheetByName(BEAGU26.summaryTab),output,23);
    replaceBody(destination.getSheetByName(BEAGU26.holdTab),holds,6);
    matched=output.length;
    // Holds include both unresolved schools and independently flagged type conflicts.
    unmatched=holds.length;
    // Synchronize nationwide submission-row count to an INTERNAL service-role-only
    // backend. Public counter UI and table SELECT permissions are disabled.
    // Never transmit single-school or individual teacher answers.
    let publishStatus="SKIPPED";
    try{
      const newUniqueSchools=countBeagu2026FirstTimeSchools(groups);
      publishStatus=publishBeagu2026NationalCount(scanned-prelaunch-undated,newUniqueSchools);
    }
    catch(e){publishStatus="PUBLIC_ERROR";Logger.log("National count publish: "+String(e.message||e).slice(0,100))}
    destination.getSheetByName(BEAGU26.logTab).appendRow([now,scanned,matched,unmatched,"SUCCESS",
      "본조사 이전 "+prelaunch+"건 제외; 시각 불명 "+undated+"건 보류; 전국 응답건수 "+publishStatus+" · 학교별 통계 비공개 검수"]);
    Logger.log("Updated internal school summary: "+matched+" schools");
  }catch(e){
    const stamp=Utilities.formatDate(new Date(),BEAGU26.timezone,"yyyy-MM-dd HH:mm:ss");
    destination.getSheetByName(BEAGU26.logTab).appendRow([stamp,scanned,matched,unmatched,"ERROR",("사전응답 제외 "+prelaunch+"건; "+String(e.message||e)).slice(0,300)]);
    throw e;
  }finally{lock.releaseLock();}
}
