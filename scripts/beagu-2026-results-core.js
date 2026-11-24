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
      let schemaReview=false;
      if(meta.kind==='grid'){
        const label=beagu26CleanOption(String(headers[col]).match(/\[([^\]]+)\]\s*$/)?.[1]);
        const expectedLabel=beagu26CleanOption(meta.rows[index]);
        if(label!==expectedLabel){
          // Exact known Form drift only. Never reinterpret a broader label.
          schemaReview=id==='Q45'&&(
            (index===10&&label==='와이파이(안정적으로 연결되는 공간)'&&expectedLabel==='교사용 와이파이(안정적으로 연결되는 공간)')||
            (index===11&&label==='와이파이(연결이 자주 끊기거나 불안정한 공간)'&&expectedLabel==='교사용 와이파이(연결이 자주 끊기거나 불안정한 공간)')
          );
          if(!schemaReview)throw Error(id+' grid row mismatch');
        }
      }
      specs.push({id,row:meta.kind==='grid'?index:-1,col,schemaReview,
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
      if(s.schemaReview){
        q.invalid++;
        reviewRows.push([sourceIndex+1,id,s.id,s.row,'SCHEMA_LABEL_REVIEW','PENDING_REVIEW']);
        return;
      }
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
