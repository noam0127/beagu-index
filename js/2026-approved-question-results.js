/* Values are released by the signed API after exact-snapshot review.
 * Lv1 continues to require 24 hours; verified Lv2 may see approved snapshots immediately.
 * Never query the private staging table from the browser. */
(function(){
  const safe=(result)=>{
    if(result?.questionId==='Q31'||result?.questionId==='Q51')return null;
    const m=window.Beagu2026Questionnaire?.[result?.questionId];
    if(!m||!Number.isInteger(result.row)||!Array.isArray(result.values)||!result.values.length)return null;
    if(m.kind==='grid'?(result.row<0||result.row>=m.rows.length):result.row!==-1)return null;
    const allowed=m.kind==='grid'?m.columns:m.options;
    if(result.values.some(v=>typeof v!=='string'||(m.kind==='time'?!/^([01]\d|2[0-3]):[0-5]\d$/.test(v):!allowed.includes(v))))return null;
    return m;
  };
  function filterResults(results){
    return (Array.isArray(results)?results:[]).flatMap(r=>{
      const m=window.Beagu2026Questionnaire?.[r?.questionId];if(!m||!Array.isArray(r.values))return [];
      const allowed=m.kind==='grid'?m.columns:m.options;
      const clean={questionId:r.questionId,row:r.row,values:[...new Set(r.values.filter(v=>typeof v==='string'&&(m.kind==='time'?/^([01]\d|2[0-3]):[0-5]\d$/.test(v):allowed.includes(v))))]};
      return safe(clean)?[clean]:[];
    });
  }
  function summary(results){
    const out={};
    for(const r of filterResults(results)){
      const m=safe(r);if(!m)continue;
      const text=(r.row>=0?m.rows[r.row]+': ':'')+r.values.join(' · ');
      (out[r.questionId]??=[]).push(text);
    }
    return Object.fromEntries(Object.entries(out).map(([id,lines])=>[id,lines.join(' / ')]));
  }
  function render(host,results,{level=1}={}){
    const groups=new Map();
    for(const r of filterResults(results)){const m=safe(r);if(!m)continue;if(!groups.has(r.questionId))groups.set(r.questionId,[]);groups.get(r.questionId).push(r);}
    if(!groups.size)return false;
    const section=document.createElement('section');section.className='beagu-approved-section';
    const note=document.createElement('p');note.className='beagu-source-caption';note.textContent='공개 검토·승인을 완료한 학교별 집계입니다. 단일선택은 최빈 응답(동률 포함), 복수선택은 선택된 항목, 시각은 평균입니다. 학교 전체 교사의 의견을 대표하지 않습니다.';section.append(note);
    for(const [id,answers] of [...groups].sort(([a],[b])=>a.localeCompare(b))){
      const m=window.Beagu2026Questionnaire[id], block=document.createElement('article');block.className='beagu-question-block';
      const heading=document.createElement('h4');heading.textContent=id+'. '+m.question;block.append(heading);
      for(const r of answers){
        // A signed school response supplies the actual Lv2 tier. Never infer it
        // from page markup or a user-controlled code field.
        if(Number(level)>=2&&window.Beagu2026Lv2Bars?.appendChoices?.(block,r,m))continue;
        const line=document.createElement('p');
        line.textContent=(r.row>=0?m.rows[r.row]+' — ':'')+r.values.join(' · ');
        block.append(line);
      }
      section.append(block);
    }
    host.append(section);return true;
  }
  window.Beagu2026ApprovedResults={render,summary};
})();
