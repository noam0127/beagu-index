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
  const audit=readBeagu2026VerifiedRematches(values,schools);
  return {startedAt,values,schools,verifiedRematches:audit.verifiedRematches,
    rematchVerified:audit.verified,rematchStale:audit.stale};
}
function refreshBeagu2026QuestionResults(snapshot) {
  const lock=snapshot?null:LockService.getScriptLock();
  if(lock&&!lock.tryLock(30000))throw Error('질문별 집계 실행 중');
  try {
    const {startedAt,values,schools,verifiedRematches}=snapshot||readBeagu2026SourceSnapshot();
    const {reviewRows, ...payload}=beagu26BuildResults(values,schools,BEAGU26_QUESTION_CATALOG,verifiedRematches);
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
  } finally {if(lock)lock.releaseLock();}
}
