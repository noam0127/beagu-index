/* Public Lv.0 school-year comparison. Only uses the verified directory and public percentile snapshot. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const LIMIT = 5;
  const YEARS = [2023, 2024, 2025];
  const collator = new Intl.Collator('ko-KR', { numeric:true, sensitivity:'base' });
  const state = { directory:new Map(), schools:[], snapshot:new Map(), snapshotReady:false,
    ready:false, selected:[], restored:false };
  const elements = {
    search:$('searchInput'), region:$('regionSelect'), office:$('officeSelect'),
    year:$('yearSelect'), suggestions:$('compareSuggestions'),
    selections:$('compareSelections'), table:$('compareTable'),
    panel:$('compareScroll'), empty:$('compareEmpty'), count:$('compareCounter'),
    feedback:$('compareFeedback'), clear:$('clearCompare'), copy:$('copyCompareLink')
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
  function currentYear() {
    const candidate=Number(elements.year.value);
    return YEARS.includes(candidate) ? candidate : 2025;
  }
  function labelForSchool(s) {
    return [s.sido_standard, s.support_office].filter(Boolean).join(' · ') || '지역 미확인';
  }
  function notice(message) { elements.feedback.textContent=message; }
  function selectedPair(id, year) {
    return state.selected.some(x=>x.id===String(id) && x.year===Number(year));
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
      const pair=/^([A-Z0-9]{7}):(2023|2024|2025)$/.exec(token);
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
    for (let index=state.selected.length;index<LIMIT;index++) {
      const placeholder=make('div',null,'compare-placeholder');
      placeholder.setAttribute('aria-hidden','true');
      placeholder.append(make('strong','＋'),make('span',String(index+1)+'번째 학교'));
      fragment.append(placeholder);
    }
    elements.selections.append(fragment);
    elements.count.textContent=state.selected.length+' / '+LIMIT+' 선택';
    elements.clear.disabled=!state.selected.length;
    elements.copy.disabled=!state.selected.length;
  }
  function percentile(school,year) {
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
  function renderTable() {
    elements.panel.hidden=!state.selected.length;
    elements.empty.hidden=!!state.selected.length;
    if (!state.selected.length) { elements.table.replaceChildren(); return; }
    const body=make('tbody');
    appendGroup(body,'학교 기본정보 · 현재 학교목록 기준');
    appendMetric(body,'학교명',s=>s.school_name);
    appendMetric(body,'시도',s=>s.sido_standard||'미확인');
    appendMetric(body,'교육지원청',s=>s.support_office||'미확인');
    appendMetric(body,'설립 구분',s=>s.establishment||'미확인');
    appendGroup(body,'배구지수 · 선택 연도별 기존 공개 기록');
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
    appendMetric(body,'자료 상태',(s,y)=>{
      const d=percentile(s,y);
      return make('span',d.label,'status-pill '+d.kind);
    });
    appendMetric(body,'학교별 상세정보',s=>{
      const link=make('a','상세보기','compare-view-link');
      link.href='school-report.html?school_id='+encodeURIComponent(String(s.school_id));
      return link;
    });
    elements.table.replaceChildren(createHeader(),body);
  }
  function renderSuggestions() {
    elements.suggestions.replaceChildren();
    const query=normalize(elements.search.value);
    if (!state.ready || query.length<2) { elements.suggestions.hidden=true;return; }
    const region=elements.region.value,office=elements.office.value;
    const matches=state.schools.filter(s=>
      normalize(s.school_name).includes(query) &&
      (!region || (s.sido_standard||'미분류')===region) &&
      (!office || (s.support_office||'미분류')===office)
    ).sort((a,b)=>collator.compare(a.school_name,b.school_name)).slice(0,8);
    if (!matches.length) {
      elements.suggestions.append(make('p','검색 결과가 없습니다. 시도·교육지원청 필터를 확인하세요.','compare-suggestion-empty'));
    } else {
      const year=currentYear();
      for (const school of matches) {
        const already=selectedPair(school.school_id,year);
        const full=state.selected.length>=LIMIT;
        const item=button(null,'compare-suggestion',()=>{
          if(addSchool(school.school_id,year)){ elements.suggestions.hidden=true; }
        },school.school_name+' '+year+'년 비교에 추가');
        item.disabled=already||full;
        const title=make('span',null,'compare-suggestion-main');
        title.append(make('strong',school.school_name),make('small',labelForSchool(school)));
        const action=make('span',already?'추가됨':full?'5개 선택됨':'+ 비교에 추가','compare-suggestion-add');
        item.append(title,action);
        elements.suggestions.append(item);
      }
    }
    elements.suggestions.hidden=false;
  }
  function sync() {
    renderSelections();
    renderTable();
    renderSuggestions();
    updateUrl();
  }
  window.BeaguStatisticsCompare={ add:addSchool };
  window.addEventListener('beagu:statistics-ready',event=>{
    const detail=event.detail||{};
    const schools=Array.isArray(detail.schools)?detail.schools:[];
    state.schools=schools;
    state.directory=new Map(schools.map(s=>[String(s.school_id),s]));
    state.snapshot=detail.snapshot instanceof Map?detail.snapshot:new Map();
    state.snapshotReady=detail.snapshotReady===true;
    state.ready=schools.length>0;
    restoreUrl();
    renderSelections();renderTable();renderSuggestions();
    if (!state.snapshotReady && state.ready) notice('공개 백분위를 확인할 수 없어 학교 기본정보만 비교할 수 있습니다.');
  });
  elements.search.addEventListener('input',renderSuggestions);
  elements.search.addEventListener('focus',renderSuggestions);
  elements.region.addEventListener('change',renderSuggestions);
  elements.office.addEventListener('change',renderSuggestions);
  elements.year.addEventListener('change',renderSuggestions);
  $('clearSearch').addEventListener('click',()=>{elements.suggestions.hidden=true;});
  $('resetFilters').addEventListener('click',()=>{elements.suggestions.hidden=true;});
  elements.search.addEventListener('keydown',event=>{
    if (event.key==='Escape') elements.suggestions.hidden=true;
  });
  document.addEventListener('click',event=>{
    if (!event.target.closest('.control-search')) elements.suggestions.hidden=true;
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
  renderSelections();
})();
