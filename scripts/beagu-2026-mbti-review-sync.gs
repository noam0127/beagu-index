/**
 * 2026 배구지수 Q14~Q17 학교문화 유형 · 비공개 검수대기 집계
 * 필수: 원본 응답 Google Sheet에 Apps Script 파일로 추가하고
 * Script Properties에 SUPABASE_PUBLISHABLE_KEY (공개용 키만) 설정
 * 실행: refreshBeagu2026SchoolCulture() / setupBeagu26SchoolCultureTrigger()
 * 데이터를 공개하거나 승인 상태를 변경하지 않습니다.
 */
const MBTI26_CONFIG=Object.freeze({
 master:"1I9SXXmOCnyeWP3RjoBHW5Tfvg0RpgR4RjnEVoxZvpp8",
 target:"MBTI_학교별_검수대기",
 hold:"MBTI_학교매칭_보류",
 log:"MBTI_실행로그",
 timezone:"Asia/Seoul",
 officialStart:"2026-11-01",
 version:"2026-Q14Q17-v1.0"
});
const MBTI26_NAMES=Object.freeze({
 ISTJ:"정돈된 실무형",ISTP:"실무 재량형",ISFJ:"숙의 안정형",ISFP:"숙의 독립형",
 INTJ:"집중 실행형",INTP:"독립 실험형",INFJ:"협의 혁신형",INFP:"자율 혁신형",
 ESTJ:"유대 운영형",ESTP:"유대 재량형",ESFJ:"공동체 안정형",ESFP:"친교 협의형",
 ENTJ:"활력 추진형",ENTP:"활력 실험형",ENFJ:"공동체 혁신형",ENFP:"친교 실험형"
});
function setupBeagu26SchoolCultureTrigger(){
 const task="refreshBeagu2026SchoolCulture";
 ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===task).forEach(t=>ScriptApp.deleteTrigger(t));
 ScriptApp.newTrigger(task).timeBased().everyDays(1).atHour(12).nearMinute(0).inTimezone(MBTI26_CONFIG.timezone).create();
 Logger.log("MBTI 비공개 집계: 매일 정오 부근 실행 트리거 등록 (실제 발화시간은 변동 가능)");
}
function mbti26_norm(value){
 return String(value==null?"":value).replace(/^[①-⑳]\s*/,"").normalize("NFKC")
   .replace(/[^\p{L}\p{N}]/gu,"").trim();
}
function mbti26_region(value){
 const s=mbti26_norm(value);
 const items=["재외한국학교","서울","부산","대구","인천","광주","대전","울산","세종",
              "경기","강원","충북","충남","전북","전남","경북","경남","제주"];
 return items.find(k=>s.startsWith(k))||null;
}
function mbti26_office(value){
 if(typeof normalizeOffice==="function")return normalizeOffice(value);
 return mbti26_norm(value)
  .replace(/전남광주통합특별시광주|전남광주통합특별시|서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전북특별자치도|전라북도|전라남도|경상북도|경상남도|제주특별자치도/g,"")
  .replace(/교육지원청|교육청/g,"");
}
function mbti26_parseDay(value){
 const m=String(value||"").match(/^(\d{4})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})/);
 if(!m)return null;
 const y=+m[1],mo=+m[2],d=+m[3],t=new Date(Date.UTC(y,mo-1,d));
 if(t.getUTCFullYear()!==y||t.getUTCMonth()!==mo-1||t.getUTCDate()!==d)return null;
 return [String(y).padStart(4,"0"),String(mo).padStart(2,"0"),String(d).padStart(2,"0")].join("-");
}
function mbti26_columns(headers){
 const requireOne=(prefix)=>{
  const match=headers.map((v,i)=>new RegExp("^"+prefix+"\\.").test(String(v).trim())?i:-1).filter(i=>i>=0);
  if(match.length!==1)throw Error(prefix+" 열 개수 불일치: "+match.length);
  return match[0];
 };
 const offices=headers.map((v,i)=>/^B02\./.test(String(v).trim())?i:-1).filter(i=>i>=0);
 if(!offices.length)throw Error("B02 교육지원청 열 누락");
 return {region:requireOne("B01"),school:requireOne("B03"),schoolType:requireOne("B04"),offices,
         q:[14,15,16,17].map(n=>requireOne("Q"+n))};
}
function mbti26_score(answer){
 const raw=String(answer==null?"":answer).trim();
 if(!raw)return null;
 const v=raw.replace(/^[①-⑳]\s*/,"").normalize("NFKC").replace(/\s+/g," ").trim();
 const opts={
   "A에 매우 가깝다":-2,"A에 조금 가깝다":-1,
   "두 모습이 비슷하게 나타난다":0,"B에 조금 가깝다":1,
   "B에 매우 가깝다":2,"해당하지 않거나 판단하기 어렵다":null
 };
 if(!Object.prototype.hasOwnProperty.call(opts,v))throw Error("검증되지 않은 Q14~Q17 선택지: "+v.slice(0,70));
 return opts[v];
}
function mbti26_indexSchools(all){
 const byKey=new Map();
 for(const s of all){
  if(!/^\d{7}$/.test(String(s.school_id)))continue;
  const key=[mbti26_region(s.sido_standard),mbti26_office(s.support_office),mbti26_norm(s.school_name)].join("|");
  if(!byKey.has(key))byKey.set(key,[]);
  byKey.get(key).push(s);
 }
 if(!all.length)throw Error("학교 MASTER 비어 있음");
 return byKey;
}
function mbti26_classify(avg){
 if(avg.some(v=>typeof v!=="number"||Math.abs(v)<0.5))return ["","","MIXED_OR_UNDETERMINED"];
 const q14=avg[0],q15=avg[1],q16=avg[2],q17=avg[3];
 const type=(q14>0?"E":"I")+(q16>0?"S":"N")+(q15>0?"T":"F")+(q17>0?"P":"J");
 return [type,MBTI26_NAMES[type],"CANDIDATE_ONLY"];
}
function mbti26_write(sheet,output,width){
 if(!sheet)throw Error("목적지 탭이 존재하지 않습니다");
 const needed=output.length+1;
 if(sheet.getMaxRows()<needed)sheet.insertRowsAfter(sheet.getMaxRows(),needed-sheet.getMaxRows());
 const previous=Math.max(0,sheet.getLastRow()-1);
 if(previous>0)sheet.getRange(2,1,previous,width).clearContent();
 if(output.length)sheet.getRange(2,1,output.length,width).setValues(output);
}
function refreshBeagu2026SchoolCulture(snapshot){
 const lock=snapshot?null:LockService.getScriptLock();
 if(lock&&!lock.tryLock(30000))throw Error("기존 MBTI 집계가 실행 중입니다");
 let scanned=0,excluded=0,matched=0,held=0,schoolCount=0;
 let destination=null;
 try {
  const {values,schools:directory}=snapshot||readBeagu2026SourceSnapshot();
  const c=mbti26_columns(values[0]);
  const schools=mbti26_indexSchools(directory);
  destination=SpreadsheetApp.openById(MBTI26_CONFIG.master);
  const reviewSheet=destination.getSheetByName(MBTI26_CONFIG.target);
  const holdSheet=destination.getSheetByName(MBTI26_CONFIG.hold);
  const logSheet=destination.getSheetByName(MBTI26_CONFIG.log);
  if(!reviewSheet||!holdSheet||!logSheet)throw Error("MBTI 검수용 탭이 누락되었습니다");
  const previous=new Map();
  if(reviewSheet.getLastRow()>1){
    for(const r of reviewSheet.getRange(2,1,reviewSheet.getLastRow()-1,25).getDisplayValues()){
      if(r[0])previous.set(r[0],r);
    }
  }
  const grouped=new Map(),holds=[],optionReview=[];
  for(let i=1;i<values.length;i++){
    const r=values[i];
    if(!r[0]&&!r[c.school])continue;
    scanned++;
    const day=mbti26_parseDay(r[0]);
    if(day&&day<MBTI26_CONFIG.officialStart){excluded++;continue}
    if(!day){holds.push([i+1,"","","","제출 일자 확인 불가","NEEDS_REVIEW",""]);held++;continue}
    const region=mbti26_region(r[c.region]);
    const offices=c.offices.map(j=>String(r[j]||"").trim()).filter(Boolean);
    const name=mbti26_norm(r[c.school]);
    const office=offices.length===1?mbti26_office(offices[0]):"";
    const schoolMatches=schools.get([region,office,name].join("|"))||[];
    if(!region||!name||!office||offices.length!==1||schoolMatches.length!==1){
      const reason=offices.length!==1?"교육지원청 미선택 또는 중복":
       !region||!name?"지역 또는 학교명 없음":schoolMatches.length>1?"중복 학교명·지원청":"학교 MASTER 미매칭";
      holds.push([i+1,String(r[c.region]||""),offices.join(" / "),String(r[c.school]||""),reason,"NEEDS_REVIEW",""]);
      held++;continue;
    }
    const school=schoolMatches[0],id=String(school.school_id);
    const selectedType=String(r[c.schoolType]||"").match(/(?:공립|국립|사립)/)?.[0]||"";
    const registeredType=String(school.establishment||"").match(/(?:공립|국립|사립)/)?.[0]||"";
    const typeConflict=!!selectedType&&!!registeredType&&selectedType!==registeredType;
    if(typeConflict){
      holds.push([i+1,String(r[c.region]||""),offices.join(" / "),String(r[c.school]||""),
        "설립유형 선택("+selectedType+")과 학교공시("+registeredType+") 불일치","NEEDS_TYPE_REVIEW",""]);
      held++;
    }
    const reviewStart=optionReview.length;
    const scores=c.q.map((j,index)=>{
      try { return mbti26_score(r[j]); }
      catch(error) {
        if(!String(error.message||'').startsWith('검증되지 않은 Q14~Q17 선택지'))throw error;
        optionReview.push([i+1,id,'Q'+(14+index),'OTHER_OR_UNKNOWN','원본 응답을 확인한 후 코드북 검수','PENDING_REVIEW']);
        return null; // Keep valid answers from other questions and schools.
      }
    });
    const hasOptionReview=optionReview.length>reviewStart;
    if(!grouped.has(id))grouped.set(id,{school,n:[0,0,0,0],sum:[0,0,0,0],rows:0,full:0,typeConflict:false,optionHold:false});
    const item=grouped.get(id);
    item.typeConflict = item.typeConflict || typeConflict;
    item.optionHold = item.optionHold || hasOptionReview;
    item.rows++;matched++;
    if(scores.every(x=>typeof x==="number"))item.full++;
    scores.forEach((v,j)=>{if(typeof v==="number"){item.n[j]++;item.sum[j]+=v}});
  }
  const stamp=Utilities.formatDate(new Date(),MBTI26_CONFIG.timezone,"yyyy-MM-dd HH:mm:ss");
  const output=[...grouped.values()].sort((a,b)=>String(a.school.school_id).localeCompare(String(b.school.school_id))).map(g=>{
    const averages=g.n.map((n,i)=>n?Math.round(g.sum[i]/n*1000)/1000:null);
    const candidate=(g.full>=5&&g.n.every(n=>n>=5))?mbti26_classify(averages):["","","INSUFFICIENT_OR_INCOMPLETE"];
    const old=previous.get(String(g.school.school_id));
    // Preserve human review notes only when recomputed source metrics are identical.
    const marker=[g.rows,...g.n.flatMap((n,i)=>[n,averages[i]??""]),g.full,candidate[0],candidate[1],candidate[2]].join("|");
    const oldMarker=old?[old[4],old[5],old[6],old[7],old[8],old[9],old[10],old[11],old[12],old[13],old[14],old[15],old[16]].join("|"):null;
    const unchanged=!!old&&marker===oldMarker;
    const review=g.typeConflict?["NEEDS_TYPE_REVIEW","UNVERIFIED","PENDING","PENDING","PENDING"]:g.optionHold?["NEEDS_QUESTION_REVIEW","UNVERIFIED","PENDING","PENDING","PENDING"]:(unchanged?old.slice(17,22):["MATCHED","UNVERIFIED","PENDING","PENDING","PENDING"]);
    // Human sign-off is never applied or assumed automatically.
    return [
      String(g.school.school_id),String(g.school.sido_standard),String(g.school.support_office),String(g.school.school_name),g.rows,
      g.n[0],averages[0]??"",g.n[1],averages[1]??"",g.n[2],averages[2]??"",g.n[3],averages[3]??"",
      g.full,candidate[0],candidate[1],candidate[2],
      ...review,MBTI26_CONFIG.version,stamp,g.typeConflict?"설립유형 불일치 · 학교 식별 및 응답자 공개동의 확인 전 공개 금지":g.optionHold?"Q14~Q17 미인식 보기 확인 필요 · 공개 보류":(unchanged?old[24]:"고유 교사 수·소표본·반복 공개 위험 확인 전 웹 공개 금지")
    ];
  });
  // Only the private worksheets are updated. Supabase release/approval tables are NEVER modified.
  mbti26_write(reviewSheet,output,25);
  mbti26_write(holdSheet,holds,7);
  const optionReviewTab=destination.getSheetByName('MBTI_기타응답_검수대기')||destination.insertSheet('MBTI_기타응답_검수대기');
  optionReviewTab.getRange(1,1,1,6).setValues([['원본행번호','학교ID','문항','검수유형','조치안내','집계상태']]);
  mbti26_write(optionReviewTab,optionReview,6);
  schoolCount=output.length;
  logSheet.appendRow([stamp,scanned,excluded,matched,held,schoolCount,"SUCCESS","비공개 후보 갱신·공개 승인 없음"]);
  Logger.log("2026 MBTI 내부 후보 "+schoolCount+"개 학교; 매칭보류 "+held+"건");
 }catch(err){
  if(destination){
    const log=destination.getSheetByName(MBTI26_CONFIG.log);
    if(log)log.appendRow([Utilities.formatDate(new Date(),MBTI26_CONFIG.timezone,"yyyy-MM-dd HH:mm:ss"),scanned,excluded,matched,held,schoolCount,"ERROR",String(err.message||err).slice(0,250)]);
  }
  throw err;
 }finally{if(lock)lock.releaseLock();}
}
