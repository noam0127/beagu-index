/* Public Lv.0 school-year comparison. Only uses the verified directory and public percentile snapshot. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const LIMIT = 5;
  const YEARS = [2023, 2024, 2025, 2026];
  const collator = new Intl.Collator('ko-KR', { numeric:true, sensitivity:'base' });
  const state = { directory:new Map(), schools:[], snapshot:new Map(), snapshotReady:false,
    ready:false, selected:[], restored:false, questionCatalog:null,
    public2026:new Map(), public2026Checked:new Set(), public2026Loading:new Set(), public2026Error:new Set(),
    approvedBySchool:new Map(), approvedLoading:new Set(), sessionToken:'',
    authLevel:0, authProvisional:false, authEpoch:0 };
  const elements = {
    search:$('searchInput'), suggestions:$('compareSuggestions'),
    selections:$('compareSelections'), table:$('compareTable'),
    panel:$('compareScroll'), results:$('compareResults'),
    empty:$('compareEmpty'), count:$('compareCounter'),
    feedback:$('compareFeedback'), clear:$('clearCompare'), copy:$('copyCompareLink'), postit:$('comparePostit'),
    authForm:$('compareLv1Form'), authCode:$('compareLv1Code'),
    authCard:$('compareLv1AuthPanel'),
    authSubmit:$('compareLv1Submit'), authBadge:$('compareLv1Badge'),
    authSignedIn:$('compareLv1SignedIn'),
    authMessage:$('compareLv1Message'), authToggle:$('compareLv1Toggle'),
    authLogout:$('compareLv1Logout'),
    lv2Upgrade:$('compareLv2Upgrade'),lv2Form:$('compareLv2Form'),
    lv2Code:$('compareLv2Code'),lv2Submit:$('compareLv2Submit'),lv2Message:$('compareLv2Message')
  };
  const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g,'');
  function make(tag, value, className) {
    const node=document.createElement(tag);
    if (className) node.className=className;
    if (value !== null && value !== undefined) node.textContent=String(value);
    return node;
  }
  function button(label, cls, onClick, ariaLabel) {
    const b=make('button',label,cls);
    b.type='button';
    if (ariaLabel) b.setAttribute('aria-label',ariaLabel);
    b.addEventListener('click',onClick);
    return b;
  }
  function currentYear() { return 2026; }
  function labelForSchool(s) {
    return [s.sido_standard, s.support_office].filter(Boolean).join(' · ') || '지역 미확인';
  }
  function notice(message) { elements.feedback.textContent=message; }
  const SESSION_KEY='beagu-level-session-v1';
  const AUTH_URL=()=>SUPABASE_URL+'/functions/v1/beagu-level-api';
  function authMessage(message) { elements.authMessage.textContent=message; }
  function updateAuthUI() {
    const authenticated=state.authLevel>=1 && !!state.sessionToken;
    elements.authForm.hidden=authenticated;
    elements.authSignedIn.hidden=!authenticated;
    elements.lv2Upgrade.hidden=!(authenticated && state.authLevel===1);
    if(state.authLevel>=2)elements.lv2Message.textContent='';
    elements.authBadge.textContent=authenticated
      ? state.authLevel>=2
        ? (state.authProvisional?'Lv.2(임시)':'Lv.2 인증됨')
        : 'Lv.1 인증됨'
      : '미인증';
    elements.authBadge.classList.toggle('is-authenticated',authenticated);
    elements.authCard.classList.toggle('is-authenticated',authenticated);
  }
  function clearAuth(message='',removeStored=true) {
    state.authEpoch++;
    state.sessionToken='';
    state.authLevel=0;
    state.authProvisional=false;
    state.approvedBySchool.clear();
    state.approvedLoading.clear();
    state.public2026.clear();state.public2026Checked.clear();state.public2026Loading.clear();state.public2026Error.clear();
    elements.lv2Code.value='';
    elements.lv2Message.textContent='';
    if(removeStored){try{sessionStorage.removeItem(SESSION_KEY)}catch(_){}}
    window.dispatchEvent(new Event('beagu:level-state-change'));
    updateAuthUI();
    authMessage(message);
    renderTable();
  }
  async function authRequest(action,payload={},token='') {
    const response=await fetch(AUTH_URL(),{
      method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json','X-Beagu-Session':token},
      body:JSON.stringify({action,...payload})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const error=new Error('AUTH_REQUEST_FAILED');
      error.status=response.status;
      throw error;
    }
    return data;
  }
  function refreshApprovedSelections(){
    if(!state.sessionToken||state.authLevel<1)return;
    for(const id of new Set(state.selected.map(x=>x.id)))loadApprovedSchool(id);
  }
  function activateAuth(token,level,provisional=false) {
    state.authEpoch++;
    state.public2026.clear();state.public2026Checked.clear();state.public2026Loading.clear();state.public2026Error.clear();
    state.sessionToken=token;
    state.authLevel=level;
    state.authProvisional=level>=2&&provisional===true;
    state.approvedBySchool.clear();
    state.approvedLoading.clear();
    try{sessionStorage.setItem(SESSION_KEY,token)}catch(_){}
    window.dispatchEvent(new Event('beagu:level-state-change'));
    updateAuthUI();
    authMessage('');
    renderTable();
    refreshApprovedSelections();
    void loadPublic2026(state.selected.map(x=>x.id),true);
  }
  async function verifyStoredSession() {
    let token='';
    try{token=sessionStorage.getItem(SESSION_KEY)||''}catch(_){}
    if(!token){updateAuthUI();return}
    const epoch=++state.authEpoch;
    elements.authBadge.textContent='인증 확인 중';
    try{
      const result=await authRequest('verify',{},token);
      if(epoch!==state.authEpoch)return;
      const level=Number(result?.level);
      if(!Number.isInteger(level)||level<1) {
        clearAuth('기존 인증이 유효하지 않습니다. 참여코드를 다시 입력해 주세요.');
        return;
      }
      activateAuth(token,level,result.provisional===true);
    }catch(error){
      if(epoch!==state.authEpoch)return;
      if(error.status===401||error.status===403){
        clearAuth('인증 유효기간이 끝났습니다. 참여코드를 다시 입력해 주세요.');
      }else{
        updateAuthUI();
        authMessage('기존 인증을 확인하지 못했습니다. 연결을 확인하거나 참여코드를 다시 입력해 주세요.');
      }
    }
  }
  function selectedPair(id, year) {
    return state.selected.some(x=>x.id===String(id) && x.year===Number(year));
  }
  function nextAvailableYear(id) {
    return [2026,2025,2024,2023].find(y=>!selectedPair(id,y)) ?? null;
  }
  function encodeSelection() {
    return state.selected.map(x=>x.id+':'+x.year).join(',');
  }
  function updateUrl() {
    const url=new URL(window.location.href);
    if (state.selected.length) url.searchParams.set('compare',encodeSelection());
    else url.searchParams.delete('compare');
    window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
  }
  function restoreUrl() {
    if (state.restored) return;
    state.restored=true;
    const raw=new URLSearchParams(window.location.search).get('compare') || '';
    for (const token of raw.split(',').slice(0,LIMIT)) {
      const pair=/^([A-Z0-9]{7}):(2023|2024|2025|2026)$/.exec(token);
      if (!pair || !state.directory.has(pair[1]) || selectedPair(pair[1],Number(pair[2]))) continue;
      state.selected.push({id:pair[1], year:Number(pair[2])});
    }
    // Discard unknown school IDs / invalid years instead of reflecting untrusted URL content.
    if (raw && encodeSelection()!==raw) updateUrl();
  }
  function addSchool(schoolId, preferredYear) {
    if (!state.ready) { notice('학교 목록을 불러온 뒤 추가할 수 있습니다.'); return false; }
    const id=String(schoolId);
    const school=state.directory.get(id);
    const year=YEARS.includes(Number(preferredYear)) ? Number(preferredYear) : currentYear();
    if (!school) { notice('학교 목록에서 해당 학교를 찾을 수 없습니다.'); return false; }
    if (selectedPair(id,year)) { notice('이미 같은 학교·연도가 비교표에 있습니다. 다른 연도를 선택할 수 있습니다.'); return false; }
    if (state.selected.length>=LIMIT) { notice('비교표에는 최대 5개의 학교·연도 조합을 추가할 수 있습니다.'); return false; }
    state.selected.push({id,year});
    notice(school.school_name+' ('+year+'년)을 비교표에 추가했습니다.');
    sync();
    loadPublic2026([id]);
    loadApprovedSchool(id);
    return true;
  }
  function removeSchool(index) {
    const gone=state.selected.splice(index,1)[0];
    if (!gone) return;
    notice(state.directory.get(gone.id).school_name+'을(를) 비교표에서 제외했습니다.');
    sync();
  }
  function moveSchool(index, direction) {
    const target=index+direction;
    if (target<0 || target>=state.selected.length) return;
    [state.selected[index],state.selected[target]]=[state.selected[target],state.selected[index]];
    notice('비교 순서를 변경했습니다.');
    sync();
  }
  function changeYear(index, year) {
    const entry=state.selected[index];
    // Year selection must never reopen the school-name suggestion list.
    elements.suggestions.hidden=true;
    const newYear=Number(year);
    if (!entry || !YEARS.includes(newYear)) return;
    if (state.selected.some((x,i)=>i!==index && x.id===entry.id && x.year===newYear)) {
      notice('같은 학교·연도는 한 번만 추가할 수 있습니다.');
      renderSelections(); return;
    }
    entry.year=newYear;
    notice('선택 연도를 '+newYear+'년으로 변경했습니다.');
    sync();
  }
  function renderSelections() {
    elements.selections.replaceChildren();
    const fragment=document.createDocumentFragment();
    state.selected.forEach((entry,index)=>{
      const school=state.directory.get(entry.id);
      if (!school) return;
      const card=make('article',null,'compare-selection');
      const header=make('div',null,'compare-selection-header');
      header.append(make('span',String(index+1).padStart(2,'0'),'compare-selection-index'));
      const actions=make('div',null,'compare-selection-actions');
      const left=button('←','compare-mini-button',()=>moveSchool(index,-1),school.school_name+' 왼쪽으로 이동');
      left.disabled=index===0;
      const right=button('→','compare-mini-button',()=>moveSchool(index,1),school.school_name+' 오른쪽으로 이동');
      right.disabled=index===state.selected.length-1;
      const remove=button('×','compare-mini-button remove',()=>removeSchool(index),school.school_name+' 비교에서 제거');
      actions.append(left,right,remove); header.append(actions);
      const yearLabel=make('label','기준연도','compare-selection-year');
      const select=make('select');
      select.setAttribute('aria-label',school.school_name+' 비교 연도 선택');
      for (const y of YEARS) {
        const option=new Option(y+'년',String(y));
        option.disabled=state.selected.some((x,i)=>i!==index && x.id===entry.id && x.year===y);
        select.add(option);
      }
      select.value=String(entry.year);
      select.addEventListener('change',()=>changeYear(index,select.value));
      yearLabel.append(select);
      card.append(header,make('h3',school.school_name,'compare-selection-title'),
        make('div',labelForSchool(school),'compare-selection-subtitle'),yearLabel);
      fragment.append(card);
    });
    // Show only schools the user actually selected; no empty slot cards.
    elements.selections.append(fragment);
    elements.count.textContent=state.selected.length+' / '+LIMIT+' 선택';
    elements.clear.disabled=!state.selected.length;
    elements.copy.disabled=!state.selected.length;
    elements.postit.disabled=!state.selected.length;
  }
  // The anonymous API is RLS-restricted to reviewed, manually released
  // 2026 rows with a 24-hour cooldown. Do not query draft or raw survey data.
  async function loadPublic2026(ids, refresh=false) {
    const requested=[...new Set(ids.map(String))].filter(id=>
      /^[A-Z0-9]{7}$/.test(id) &&
      (refresh || !state.public2026Checked.has(id)) && !state.public2026Loading.has(id));
    if(!requested.length || typeof supabaseClient==='undefined')return;
    if(!state.sessionToken||state.authLevel<1)return;
    requested.forEach(id=>{
      state.public2026.delete(id);
      state.public2026Checked.delete(id);
      state.public2026Error.delete(id);
      state.public2026Loading.add(id);
    });
    renderTable();
    try{
      const token=state.sessionToken,epoch=state.authEpoch;
      const result=state.authLevel>=1&&token?await authRequest('percentiles',{schoolIds:requested},token):{values:{}};
      if(epoch!==state.authEpoch||token!==state.sessionToken)return;
      for(const id of requested){state.public2026.delete(id);state.public2026Error.delete(id);const v=result.values?.[id];if(typeof v==='number'&&v>=0&&v<=100)state.public2026.set(id,v);}
      requested.forEach(id=>state.public2026Checked.add(id));
    }catch(error){
      console.warn('2026년 공개 승인 기록 조회 실패',error);
      requested.forEach(id=>{
        state.public2026.delete(id);
        state.public2026Checked.delete(id);
        state.public2026Error.add(id);
      });
    }finally{
      requested.forEach(id=>state.public2026Loading.delete(id));
      renderTable();
    }
  }
  function percentile(school,year) {
    if(year===2026){
      const id=String(school.school_id);
      const value=state.public2026.get(id);
      if(typeof value==='number')return {value,label:'공개 기록',kind:'yes'};
      if(state.public2026Loading.has(id)||(!state.public2026Checked.has(id)&&!state.public2026Error.has(id)))
        return {value:null,label:'확인 중',kind:'pending'};
      if(state.public2026Error.has(id))return {value:null,label:'조회 실패',kind:'failure'};
      return {value:null,label:'미공개',kind:'empty'};
    }
    if (!state.snapshotReady) return {value:null,label:'연결 오류',kind:'failure'};
    const row=state.snapshot.get(String(school.school_id));
    if (!row || !Array.isArray(row.statuses) || !Array.isArray(row.percentiles))
      return {value:null,label:'자료 없음',kind:'empty'};
    const offset=year-2023, status=row.statuses[offset], value=row.percentiles[offset];
    if (['VERIFIED_LEGACY_RESTORATION','EXISTING_PUBLIC_VALUE_PRESERVED'].includes(status) &&
        typeof value==='number' && Number.isFinite(value) && value>=0 && value<=100)
      return {value,label:'공개 기록',kind:'yes'};
    if (status==='REVIEW_PENDING') return {value:null,label:'검수 중',kind:'pending'};
    return {value:null,label:'자료 없음',kind:'empty'};
  }
  function createHeader() {
    const thead=make('thead'), row=make('tr'), first=make('th','비교 항목');
    first.scope='col';
    row.append(first);
    state.selected.forEach((entry,index)=>{
      const school=state.directory.get(entry.id),th=make('th');
      th.scope='col';
      th.append(make('div',school.school_name,'compare-school-heading'),
        make('div',entry.year+'년 · 비교 '+(index+1),'compare-year-heading'));
      row.append(th);
    });
    thead.append(row);
    return thead;
  }
  function appendGroup(tbody,title) {
    const tr=make('tr',null,'compare-group'),th=make('th',title);
    th.colSpan=state.selected.length+1;
    tr.append(th);tbody.append(tr);
  }
  function appendMetric(tbody,label,getValue) {
    const tr=make('tr'), header=make('th',label);
    header.scope='row';tr.append(header);
    state.selected.forEach(entry=>{
      const school=state.directory.get(entry.id), td=make('td');
      const value=getValue(school,entry.year);
      if (value && typeof value==='object' && value.nodeType) td.append(value);
      else td.textContent=String(value ?? '—');
      tr.append(td);
    });
    tbody.append(tr);
  }

  // Keep the selected schools and current section visible while the page itself
  // scrolls. CSS-only sticky cannot escape the horizontal overflow container.
  const stickyHeader={root:null,scroller:null,label:null,table:null,frame:0};
  function ensureStickyHeader(){
    if(stickyHeader.root)return;
    const root=make('div',null,'compare-sticky-viewport');
    root.hidden=true;
    root.setAttribute('aria-hidden','true');
    const scroller=make('div',null,'compare-sticky-scroll');
    const table=make('table',null,'compare-table compare-sticky-table');
    scroller.append(table);
    const label=make('div',null,'compare-sticky-title');
    root.append(scroller,label);
    document.body.append(root);
    Object.assign(stickyHeader,{root,scroller,label,table});
    elements.panel.addEventListener('scroll',()=>{
      if(!root.hidden)scroller.scrollLeft=elements.panel.scrollLeft;
      scheduleStickyHeader();
    },{passive:true});
    window.addEventListener('scroll',scheduleStickyHeader,{passive:true});
    window.addEventListener('resize',refreshStickyHeader,{passive:true});
  }
  function scheduleStickyHeader(){
    if(!stickyHeader.root||stickyHeader.frame)return;
    stickyHeader.frame=requestAnimationFrame(()=>{
      stickyHeader.frame=0;
      updateStickyHeader();
    });
  }
  function refreshStickyHeader(){
    if(!stickyHeader.root)return;
    const head=elements.table.tHead;
    if(!head || elements.panel.hidden){stickyHeader.root.hidden=true;return;}
    const originalCells=[...head.rows[0].cells];
    const widths=originalCells.map(cell=>cell.getBoundingClientRect().width);
    if(!widths.length||widths.some(width=>width<=0)){
      stickyHeader.root.hidden=true;return;
    }
    const cols=make('colgroup');
    widths.forEach(width=>{
      const col=make('col');
      col.style.width=width+'px';
      cols.append(col);
    });
    const copiedHead=head.cloneNode(true);
    [...copiedHead.rows[0].cells].forEach((cell,index)=>{
      cell.style.width=widths[index]+'px';
      cell.style.minWidth=widths[index]+'px';
      cell.style.maxWidth=widths[index]+'px';
    });
    stickyHeader.table.style.width=widths.reduce((sum,width)=>sum+width,0)+'px';
    stickyHeader.table.replaceChildren(cols,copiedHead);
    stickyHeader.scroller.scrollLeft=elements.panel.scrollLeft;
    scheduleStickyHeader();
  }
  function updateStickyHeader(){
    if(!stickyHeader.root)return;
    const head=elements.table.tHead;
    if(!head||elements.panel.hidden){
      stickyHeader.root.hidden=true;return;
    }
    const bounds=elements.panel.getBoundingClientRect();
    const headHeight=head.getBoundingClientRect().height;
    const shouldShow=bounds.top+headHeight<0 &&
      bounds.bottom>headHeight+45 && bounds.width>0;
    stickyHeader.root.hidden=!shouldShow;
    if(!shouldShow)return;
    stickyHeader.root.style.left=bounds.left+'px';
    stickyHeader.root.style.width=bounds.width+'px';
    stickyHeader.scroller.scrollLeft=elements.panel.scrollLeft;
    const groups=[...elements.table.querySelectorAll('tbody .compare-group')];
    const threshold=stickyHeader.root.getBoundingClientRect().bottom;
    let title=groups[0]?.textContent.trim()||'항목별 비교';
    for(const group of groups){
      if(group.getBoundingClientRect().top>threshold)break;
      title=group.textContent.trim();
    }
    if(stickyHeader.label.textContent!==title)stickyHeader.label.textContent=title;
  }
  // Reviewed school facts are returned by the authenticated school endpoint.
  // Facts may have a different source year from the comparison survey year.
  const basicFactLabels=[
    ['students','학생수'],
    ['teachers','교원수'],
    ['junior_teacher_ratio','2급 정교사 비율'],
    ['male_teacher_ratio','남교사 비율'],
    ['district_housing_price_mean','공동주택 평균 공시가격 (학교 소재 행정동)']
  ];
  const basicFactKeys=new Set(basicFactLabels.map(([key])=>key));
  function formatHousingPrice(value){
    if(value==null||value==='')return '자료 없음';
    const n=Number(String(value).replace(/[,\s]/g,'').replace(/원$/,''));
    if(!Number.isFinite(n)||n<=0)return '자료 없음';
    const m=Math.round(n/1000000),e=Math.floor(m/100),r=m%100;
    return e?(r?e+'억'+r+'백만원':e+'억원'):r+'백만원';
  }
  function basicFactFor(school,selectedYear,key){
    const approved=state.approvedBySchool.get(String(school.school_id));
    const candidates=[2024,2025]
      .filter(year=>year<=selectedYear)
      .map(year=>({year,fact:approved?.basicFacts?.[year]?.[key]}))
      .filter(({fact})=>fact && Number.isInteger(fact.referenceYear) &&
        fact.referenceYear<=selectedYear && fact.referenceYear>=2000)
      .sort((a,b)=>b.fact.referenceYear-a.fact.referenceYear||b.year-a.year);
    return candidates[0]?.fact||null;
  }
  function basicFactCell(school,selectedYear,key){
    // Never display a protected numeric housing price at Lv.0.
    if(key==='district_housing_price_mean' && (!state.sessionToken || state.authLevel<2)) {
      const blurred=make('span','₩ •••,•••,•••','compare-price-masked');
      blurred.setAttribute('aria-label','Lv.2 전용 · 실제 공시가격 미공개');
      const container=make('div',null,'compare-price-locked');
      container.append(blurred,make('small','🔒 Lv.2 인증 후 확인','compare-price-callout'));
      return container;
    }
    if(!state.sessionToken || state.authLevel<1)
      return make('span','Lv.1 인증 후 확인','compare-unavailable');
    const fact=basicFactFor(school,selectedYear,key);
    if(!fact){
      if(state.approvedLoading.has(String(school.school_id)))
        return make('span','확인 중…','compare-unavailable');
      return make('span','자료 없음','compare-unavailable');
    }
    const wrap=make('div',null,'compare-basic-value');
    wrap.append(make('strong',key==='district_housing_price_mean'?formatHousingPrice(fact.value):fact.value,'compare-approved-value'),
      make('small',fact.referenceYear+'년 기준','compare-basic-reference'));
    return wrap;
  }
  // Consistent circled option indexes for every survey year (display only).
  // Never rewrite stored data, official numeric facts, quantities or scores.
  function circledChoiceIndex(n){
    if(n>=1&&n<=20)return String.fromCodePoint(0x2460+n-1);
    if(n>=21&&n<=35)return String.fromCodePoint(0x3251+n-21);
    if(n>=36&&n<=50)return String.fromCodePoint(0x32B1+n-36);
    return null;
  }
  function normalizeChoiceNumbering(value){
    if(typeof value!=='string'||!value)return value;
    const parts=value.split(/(\s*[·;|]\s*|\s+\/\s+|,\s*(?=\s*(?:50|[1-4]\d|[1-9])(?:\s*[,;·|]|\s*[.)、:]|\s+\S|\s*$)))/);
    return parts.map((part,index)=>{
      if(index%2||!part.trim())return part;
      const original=part.trim();
      // The number itself represents a verified survey choice.
      if(/^(?:50|[1-4]\d|[1-9])$/.test(original))
        return part.replace(original,circledChoiceIndex(Number(original)));
      // Enumerated option with a separator: "1. 내용" / "2) 내용".
      const numbered=original.match(/^(50|[1-4]\d|[1-9])([.)、:])\s*([\s\S]*)$/);
      if(numbered){
        const label=numbered[3].trim();
        // Do not reinterpret decimals (1.5), ratios (1:2), or clock times.
        if((numbered[2]==='.'||numbered[2]===':')&&/^\d/.test(label))return part;
        const circle=circledChoiceIndex(Number(numbered[1]));
        return part.replace(original,circle+(label?' '+label:''));
      }
      // The historical answer "1 1회미만" is an enumerated option,
      // unlike "1회미만", "1점" or a numeric measurement.
      const spaced=original.match(/^(50|[1-4]\d|[1-9])\s+(\S[\s\S]*)$/);
      if(spaced){
        if(/^(?:점|%|명|명당|원|㎡|학급|개|년|월|일|회)(?:\s|$)/.test(spaced[2]))return part;
        return part.replace(original,circledChoiceIndex(Number(spaced[1]))+' '+spaced[2]);
      }
      return part;
    }).join('');
  }
  function renderTable() {
    const hasSelections=state.selected.length>0;
    elements.panel.hidden=!hasSelections;
    elements.results.hidden=!hasSelections;
    elements.empty.hidden=hasSelections;
    if (!state.selected.length) {
      elements.table.replaceChildren();
      if(stickyHeader.root)stickyHeader.root.hidden=true;
      return;
    }
    const body=make('tbody');
    appendGroup(body,'배구지수 · 선택 연도별 공개 기록');
    appendMetric(body,'조사 기준연도',(_s,y)=>y+'년');
    appendMetric(body,'공개 백분위',(s,y)=>{
      const d=percentile(s,y);
      if (d.value===null) return make('span',d.label,'compare-unavailable');
      const wrap=make('div');
      wrap.append(make('strong',d.value.toFixed(1)+'%','compare-percent'));
      const track=make('div',null,'compare-percent-track');
      const fill=make('span'); fill.style.width=d.value+'%';track.append(fill);wrap.append(track);
      return wrap;
    });
    appendMetric(body,'유효 응답 건수',(s,y)=>percentile(s,y).value===null?'—':'공개 자료에서 확인되지 않음');
    appendMetric(body,'백분위 비교 모집단',(s,y)=>percentile(s,y).value===null?'—':y===2025?'1,458개교':'공개 자료에서 확인되지 않음');
    appendGroup(body,'기본사항');
    for(const [key,label] of basicFactLabels)
      appendMetric(body,label,(school,year)=>basicFactCell(school,year,key));
    const years=[...new Set(state.selected.map(e=>e.year))].sort((a,b)=>a-b);
    for(const year of years){
      const catalog=state.questionCatalog?.years?.[String(year)];
      if(!catalog||!Array.isArray(catalog.items)) {
        appendGroup(body,year+'년 · 문항 정보');
        appendMetric(body,'설문 문항',(_s,selectedYear)=>selectedYear===year?'문항 목록을 불러오는 중…':'—');
        continue;
      }
      const groups=[...new Set(catalog.items.map(x=>x.group))];
      for(const group of groups){
        appendGroup(body,year+'년 · '+group);
        for(const item of catalog.items.filter(x=>x.group===group)){
          appendMetric(body,item.id+' · '+item.label,(school,selectedYear)=>{
            if(selectedYear!==year)return make('span','—','compare-other-year');
            const approved=state.approvedBySchool.get(String(school.school_id));
            if(approved?.items?.[year]?.[item.id]!==undefined)
              return make('span',normalizeChoiceNumbering(approved.items[year][item.id]),'compare-approved-value');
            if(state.approvedLoading.has(String(school.school_id)))
              return make('span','확인 중…','compare-unavailable');
            return make('span',state.sessionToken && approved ? '승인된 값 없음' : '상세 인증 후 열람','compare-unavailable');
          });
        }
      }
    }
    // Only summary metrics returned by the authenticated server are shown.
    // Do not infer missing school data from other schools' figures.
    const summaryYears=years.filter(year=>state.selected.some(entry=>
      Array.isArray(state.approvedBySchool.get(entry.id)?.summaries?.[year]) &&
      state.approvedBySchool.get(entry.id).summaries[year].length));
    for(const year of summaryYears){
      const rows=new Map();
      for(const entry of state.selected.filter(e=>e.year===year)){
        const values=state.approvedBySchool.get(entry.id)?.summaries?.[year]||[];
        for(const item of values) rows.set(item.group+' · '+item.label,item);
      }
      if(!rows.size)continue;
      appendGroup(body,year+'년 · 승인된 추가 학교정보');
      for(const key of rows.keys()){
        appendMetric(body,key,(school,selectedYear)=>{
          if(selectedYear!==year)return '—';
          const approved=state.approvedBySchool.get(String(school.school_id));
          const data=approved?.summaries?.[year]?.find(x=>x.group+' · '+x.label===key);
          return data?make('span',data.value,'compare-approved-value'):'—';
        });
      }
    }
    elements.table.replaceChildren(createHeader(),body);
    ensureStickyHeader();
    refreshStickyHeader();
  }
  async function loadPublicQuestions() {
    try {
      const response=await fetch('data/public-statistics-question-catalog-v1.json',{cache:'no-cache'});
      if(!response.ok)throw Error('설문 문항 목록 응답 실패');
      const catalog=await response.json();
      if(!catalog?.years || !YEARS.every(y=>
        Array.isArray(catalog.years[String(y)]?.items)))throw Error('설문 문항 목록 형식 오류');
      state.questionCatalog=catalog;
    }catch(err) {
      console.error('설문 문항 로드 실패',err);
      notice('설문 문항 목록을 불러오지 못했습니다. 새로고침해 주세요.');
    }
    renderTable();
  }
  function validServerText(value,max=180) {
    return (typeof value==='string'||typeof value==='number') &&
      String(value).length<=max && !/[\u0000-\u0008]/.test(String(value));
  }
  async function loadApprovedSchool(id, refresh=false) {
    if(!state.sessionToken || state.authLevel<1 ||
        !/^[A-Z0-9]{7}$/.test(String(id)) ||
        state.approvedLoading.has(id) || (!refresh && state.approvedBySchool.has(id)) ||
        typeof SUPABASE_URL!=='string') return;
    const epoch=state.authEpoch;
    const token=state.sessionToken;
    state.approvedLoading.add(id);
    const cached=state.approvedBySchool.get(id);
    if(cached){
      cached.items[2026]={};
      cached.summaries[2026]=[];
    }
    renderTable();
    try{
      const data=await authRequest('school',{schoolId:id},token);
      if(epoch!==state.authEpoch||token!==state.sessionToken)return;
      const approved={
        items:{2023:{},2024:{},2025:{},2026:{}},
        summaries:{2023:[],2024:[],2025:[],2026:[]},
        basicFacts:{2024:{},2025:{}}
      };
      for(const row of Array.isArray(data?.rows)?data.rows:[]){
        const year=Number(row?.year);
        if(!YEARS.includes(year) || ![1,2].includes(Number(row?.access_level)) || Number(row.access_level)>state.authLevel)continue;
        for(const metric of Array.isArray(row?.summary?.metrics)?row.summary.metrics:[]){
          if(!metric||typeof metric!=='object')continue;
          if(/^Q\d{2}$/.test(metric.key||'') &&
            typeof metric.value==='number'&&Number.isFinite(metric.value) &&
            validServerText(metric.unit||'',20)){
            approved.items[year][metric.key]=String(metric.value)+String(metric.unit||'');
          }else if(validServerText(metric.label,80)&&validServerText(metric.value,100)){
            const official=metric.group==='편집본 공식 학교정보';
            const factKey=String(metric.factKey||'');
            if(state.authLevel<2&&factKey==='district_housing_price_mean')continue;
            const referenceYear=Number(metric.referenceYear);
            // Promote four official facts without duplicating them in the
            // original generic "additional school information" table.
            if(official && basicFactKeys.has(factKey) && [2024,2025].includes(year)){
              if(Number.isInteger(referenceYear)&&referenceYear>=2000&&referenceYear<=2026)
                approved.basicFacts[year][factKey]={
                  value:String(metric.value),referenceYear
                };
            }else{
              if(state.authLevel<2 && factKey==='district_housing_price_mean')continue;
              approved.summaries[year].push({
                group:official?'편집본 공식 학교정보':'승인된 설문 영역 요약',
                label:String(metric.label),value:String(metric.value)
              });
            }
          }
        }
      }
      for(const record of Array.isArray(data?.schoolQuestionModes)?data.schoolQuestionModes:[]){
        const year=Number(record?.year),qid=String(record?.questionId||'');
        if(![2023,2024,2025].includes(year)||!/^Q\d{2}$/.test(qid)||
           !validServerText(record.modeOption,180))continue;
        approved.items[year][qid]=String(record.modeOption);
      }
      Object.assign(approved.items[2026],window.Beagu2026ApprovedResults?.summary(data.schoolQuestionResults2026)||{});
      if(epoch===state.authEpoch && token===state.sessionToken)
        state.approvedBySchool.set(id,approved);
    }catch(error){
      if(epoch!==state.authEpoch)return;
      if(error.status===401||error.status===403)
        clearAuth('인증이 만료되었습니다. 참여코드를 다시 입력해 주세요.');
      else console.warn('승인된 학교별 상세자료 확인 실패:',error);
    }finally{
      if(epoch===state.authEpoch){
        state.approvedLoading.delete(id);
        renderTable();
      }
    }
  }
  function renderSuggestions() {
    elements.suggestions.replaceChildren();
    const query=normalize(elements.search.value);
    if (!state.ready || query.length<2) { elements.suggestions.hidden=true;return; }
    const matches=state.schools.filter(s=>
      normalize(s.school_name).includes(query)
    ).sort((a,b)=>collator.compare(a.school_name,b.school_name)).slice(0,8);
    if (!matches.length) {
      elements.suggestions.append(make('p','검색 결과가 없습니다. 학교명을 확인해 주세요.','compare-suggestion-empty'));
    } else {
      for (const school of matches) {
        const year=nextAvailableYear(school.school_id);
        const already=year===null;
        const full=state.selected.length>=LIMIT;
        const item=button(null,'compare-suggestion',()=>{
          if(year!==null && addSchool(school.school_id,year)){ elements.suggestions.hidden=true; }
        },school.school_name+(year!==null?' '+year+'년':'')+' 비교에 추가');
        item.disabled=already||full;
        const title=make('span',null,'compare-suggestion-main');
        title.append(make('strong',school.school_name),make('small',labelForSchool(school)));
        const action=make('span',already?'모든 연도 추가됨':full?'5개 선택됨':'＋ '+year+'년 추가','compare-suggestion-add');
        item.append(title,action);
        elements.suggestions.append(item);
      }
    }
    elements.suggestions.hidden=false;
  }
  function sync() {
    renderSelections();
    renderTable();
    // Suggestions open only through explicit interaction with the search input.
    updateUrl();
  }
  function refreshVisible2026(){
    if(document.visibilityState!=='visible')return;
    const ids=[...new Set(state.selected.filter(item=>item.year===2026).map(item=>item.id))];
    void loadPublic2026(ids,true);
    ids.forEach(id=>{void loadApprovedSchool(id,true);});
  }
  document.addEventListener('visibilitychange',refreshVisible2026);
  window.setInterval(refreshVisible2026,60000);
  window.BeaguStatisticsCompare={ add:addSchool };
  function consumeStatisticsReady(event){
    const detail=event.detail||{};
    if(detail.snapshotOnly===true){
      state.snapshot=detail.snapshot instanceof Map?detail.snapshot:new Map();
      state.snapshotReady=detail.snapshotReady===true;
      if(state.snapshotReady&&elements.feedback.textContent==='공개 백분위를 확인할 수 없어 문항 목록만 표시됩니다.')
        notice('');
      renderTable();
      return;
    }
    const schools=Array.isArray(detail.schools)?detail.schools:[];
    state.schools=schools;
    state.directory=new Map(schools.map(s=>[String(s.school_id),s]));
    state.snapshot=detail.snapshot instanceof Map?detail.snapshot:new Map();
    state.snapshotReady=detail.snapshotReady===true;
    state.ready=schools.length>0;
    restoreUrl();
    renderSelections();renderTable();
    if(document.activeElement===elements.search)renderSuggestions();
    if (!state.snapshotReady && state.ready && !detail.snapshotPending) notice('공개 백분위를 확인할 수 없어 문항 목록만 표시됩니다.');
    loadPublic2026(state.selected.map(x=>x.id));
    refreshApprovedSelections();
  }
  window.addEventListener('beagu:statistics-ready',consumeStatisticsReady);
  const previousReady=window.BeaguStatisticsDirectoryState;
  if(previousReady?.directory)consumeStatisticsReady({detail:previousReady.directory});
  if(previousReady?.snapshot)consumeStatisticsReady({detail:previousReady.snapshot});
  loadPublicQuestions();
  elements.search.addEventListener('input',renderSuggestions);
  elements.search.addEventListener('focus',renderSuggestions);
  $('clearSearch').addEventListener('click',()=>{
    elements.search.value='';$('clearSearch').hidden=true;
    elements.suggestions.hidden=true;
    elements.search.focus();
  });
  elements.search.addEventListener('input',()=>{
    $('clearSearch').hidden=!elements.search.value;
  });
  elements.search.addEventListener('keydown',event=>{
    if (event.key==='Escape') elements.suggestions.hidden=true;
  });
  document.addEventListener('click',event=>{
    if (!event.target.closest('.compare-search-field')) elements.suggestions.hidden=true;
  });
  elements.clear.addEventListener('click',()=>{
    state.selected=[];notice('비교표를 초기화했습니다.');sync();
  });
  elements.copy.addEventListener('click',async()=>{
    const link=window.location.href;
    try{
      if(!navigator.clipboard?.writeText) throw new Error('CLIPBOARD_UNAVAILABLE');
      await navigator.clipboard.writeText(link);
      notice('선택한 학교·연도를 그대로 열 수 있는 링크를 복사했습니다.');
    }catch(_){
      window.prompt('아래 비교 링크를 복사하세요.',link);
      notice('비교 링크를 표시했습니다.');
    }
  });
  elements.postit.addEventListener('click',async()=>{
    if(elements.postit.hidden||elements.postit.inert)return;
    if(!state.selected.length)return;
    const comparison=encodeSelection();
    const shareUrl=new URL('statistics.html',window.location.href);
    shareUrl.searchParams.set('compare',comparison);
    const postitUrl=new URL('postit.html',window.location.href);
    postitUrl.searchParams.set('compare',comparison);
    try{await navigator.clipboard?.writeText?.(shareUrl.href)}catch(_){}
    window.location.assign(postitUrl.href);
   });
   elements.authForm.addEventListener('submit',async event=>{
    event.preventDefault();
    const code=elements.authCode.value.trim();
    if(!code)return;
    const epoch=++state.authEpoch;
    elements.authSubmit.disabled=true;
    authMessage('서버에서 참여코드를 확인하는 중…');
    const loading=window.BeaguLoading?.start('Lv.1 참여코드를 확인하는 중…');
    try{
      const result=await authRequest('login',{code});
      if(epoch!==state.authEpoch)return;
      const level=Number(result?.level);
      if(!Number.isInteger(level)||level<1||typeof result.token!=='string'||!result.token)
        throw Error('INVALID_LEVEL_OR_TOKEN');
      elements.authCode.value='';
      elements.authCode.type='password';
      elements.authToggle.textContent='표시';
      elements.authToggle.setAttribute('aria-pressed','false');
      elements.authToggle.setAttribute('aria-label','참여코드 표시');
      activateAuth(result.token,level);
    }catch(_){
      if(epoch===state.authEpoch)authMessage('인증할 수 없습니다. 참여코드와 인터넷 연결을 확인해 주세요.');
    }finally{
      elements.authSubmit.disabled=false;
      window.BeaguLoading?.finish(loading);
    }
  });
  elements.lv2Form.addEventListener('submit',async event=>{
    event.preventDefault();
    // Refuse upgrade requests unless a currently authenticated Lv.1 session exists.
    if(state.authLevel!==1 || !state.sessionToken)return;
    const code=elements.lv2Code.value.trim();
    if(!code){elements.lv2Message.textContent='Lv.2 참여코드를 입력해 주세요.';return;}
    const currentToken=state.sessionToken,epoch=++state.authEpoch;
    elements.lv2Submit.disabled=true;
    elements.lv2Message.textContent='Lv.2 참여코드를 확인하는 중…';
    try{
      const next=await authRequest('login',{code});
      if(epoch!==state.authEpoch || currentToken!==state.sessionToken)return;
      if(!/^[a-f0-9]{64}$/.test(String(next?.token||'')))throw Error('INVALID_TOKEN');
      const verified=await authRequest('verify',{},next.token);
      if(epoch!==state.authEpoch || currentToken!==state.sessionToken)return;
      if(Number(verified?.level)<2){
        elements.lv2Message.textContent='아직 Lv.2 승급 조건을 충족하지 않았습니다. Lv.1 인증은 그대로 유지됩니다.';
        return;
      }
      elements.lv2Code.value='';
      activateAuth(next.token,2,verified.provisional===true);
      window.dispatchEvent(new CustomEvent('beagu:participation-authenticated',
        {detail:{token:next.token,level:2,provisional:verified.provisional===true}}));
    }catch(_){
      if(epoch===state.authEpoch)
        elements.lv2Message.textContent='Lv.2 코드를 확인하지 못했습니다. 기존 Lv.1 인증은 유지됩니다.';
    }finally{
      elements.lv2Submit.disabled=false;
      elements.lv2Code.value='';
    }
  });
  elements.authLogout.addEventListener('click',()=>{
    clearAuth('로그아웃했습니다. 학교별 상세자료는 다시 인증해야 볼 수 있습니다.');
  });
  elements.authToggle.addEventListener('click',()=>{
    const show=elements.authCode.type==='password';
    elements.authCode.type=show?'text':'password';
    elements.authToggle.textContent=show?'숨기기':'표시';
    elements.authToggle.setAttribute('aria-pressed',String(show));
    elements.authToggle.setAttribute('aria-label',show?'참여코드 숨기기':'참여코드 표시');
  });
  window.addEventListener('beagu:participation-authenticated',event=>{
    const next=event.detail;
    if(next&&Number(next.level)>=1&&typeof next.token==='string')
      activateAuth(next.token,Number(next.level),next.provisional===true);
  });
  window.addEventListener('beagu:participation-logged-out',()=>{
    clearAuth('참여코드 인증이 해제되었습니다.');
  });
  updateAuthUI();
  verifyStoredSession();
  renderSelections();
})();
