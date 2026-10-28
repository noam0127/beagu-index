/* 배구지수 공개 통계표: Step 1-5 (public-record validation)
 * 신규 공개/등급 지표를 생성하지 않는다.
 * 학교목록: Supabase public.schools 공개 필드만.
 * 연도별 백분위: 기존 검증된 Lv.0 data/public-lv0-percentiles-v1.2.json만.
 * 공개 숫자순 정렬 및 Lv1/2 내부 summary 브라우저 조회 금지.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const schoolRows = $('schoolRows');
  const search = $('searchInput');
  const region = $('regionSelect');
  const office = $('officeSelect');
  const year = $('yearSelect');
  const size = $('pageSize');
  const mobileCards = $('mobileCards');
  const viewCardsButton = $('viewCards');
  const viewTableButton = $('viewTable');
  const clearSearch = $('clearSearch');
  const tableSwipeHint = $('tableSwipeHint');
  const state = { schools: [], filtered: [], snapshot: new Map(), snapshotReady: false,
    snapshotError: null, loading: true, page: 0, pageSize: 25,
    sortBy: 'school_name', ascending: true, selectedYear: '2025', directoryTotal: 0, mobileView:'cards' };
  const collator = new Intl.Collator('ko-KR', {numeric: true, sensitivity: 'base'});
  const regions = ['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주'];
  let debounceTimer;
  let dialogInvokedBy = null;

  function text(tag, value, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    e.textContent = String(value ?? '');
    return e;
  }
  const norm = v => String(v ?? '').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g,'');
  const trim = v => String(v ?? '').trim();
  const verifiedSchool = s => s && /^[0-9]{7}$/.test(String(s.school_id)) &&
    typeof s.school_name === 'string' && trim(s.school_name).length > 0;
  function displayRegion(s) { return trim(s.sido_standard) || '미분류'; }
  function displayOffice(s) { return trim(s.support_office) || '미분류'; }
  function statusDatum(s, y) {
    if (!state.snapshotReady) return {kind:'failure', label:'연결 오류', value:null};
    const row = state.snapshot.get(String(s.school_id));
    if (!row) return {kind:'empty', label:'자료 없음', value:null};
    const i = y-2023;
    const status = row.statuses[i];
    const value = row.percentiles[i];
    if (['VERIFIED_LEGACY_RESTORATION','EXISTING_PUBLIC_VALUE_PRESERVED'].includes(status) &&
        typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100)
      return {kind:'yes', label:'공개 기록', value};
    if (status === 'REVIEW_PENDING') return {kind:'pending', label:'검수 중', value:null};
    return {kind:'empty', label:'자료 없음', value:null};
  }
  function yearsForView() { return state.selectedYear === 'all' ? [2023,2024,2025] : [Number(state.selectedYear)]; }
  function renderHeader() {
    const base = $('percentileHeader');
    const extra = document.querySelectorAll('[data-extra-year]');
    extra.forEach(el=>el.remove());
    if (state.selectedYear === 'all') {
      base.textContent = '2023년 공개 백분위';
      for (const yr of [2024,2025]) {
        const th = text('th',`${yr}년 공개 백분위`,'col-percentile three-year');
        th.scope = 'col'; th.dataset.extraYear = String(yr);
        base.after(th);
        // after(base) inserts reverse order: reorder below to ascending
      }
      const h24 = document.querySelector('[data-extra-year="2024"]');
      const h25 = document.querySelector('[data-extra-year="2025"]');
      if (h24 && h25) h24.after(h25);
      $('statusHeader').textContent = '공개 기록';
    } else {
      base.textContent = `${state.selectedYear}년 공개 백분위`;
      $('statusHeader').textContent = '자료 상태';
    }
    const names = {school_name:'colSchool',sido_standard:'colRegion',support_office:'colOffice',establishment:'colEstablishment'};
    Object.entries(names).forEach(([key,id])=>{
      const el = $(id); if (!el) return;
      const active = state.sortBy===key;
      el.setAttribute('aria-sort',active ? (state.ascending?'ascending':'descending') : 'none');
      const b = el.querySelector('button');
      b.classList.toggle('active',active);
      b.querySelector('.sort-glyph').textContent = active ? (state.ascending?'↑':'↓') : '↕';
    });
  }
  function getSorted() {
    const query = norm(search.value);
    const r = region.value;
    const o = office.value;
    const list = state.schools.filter(s => {
      if (query && !norm(s.school_name).includes(query)) return false;
      if (r && displayRegion(s) !== r) return false;
      if (o && displayOffice(s) !== o) return false;
      return true;
    });
    const field = state.sortBy;
    list.sort((a,b) => {
      const va = a[field] ?? '', vb=b[field] ?? '';
      const diff=collator.compare(String(va),String(vb));
      return (state.ascending ? diff : -diff) || collator.compare(String(a.school_id),String(b.school_id));
    });
    return list;
  }
  function cell(tr, value, cls = '') {
    const td = text('td',value,cls);
    tr.append(td);
    return td;
  }
  function statusPill(d) {
    const span = text('span',d.label,`status-pill ${d.kind}`);
    return span;
  }
  function percentCell(tr, d, isAll) {
    const td = document.createElement('td');
    td.className = isAll ? 'three-year' : 'percentage';
    if (d.value !== null) {
      const n=text('span', `${d.value.toFixed(1)}%`,isAll?'year-val':'');
      td.append(n);
    } else {
      td.classList.add('unknown');
      td.append(text('span', d.label === '자료 없음' ? '—' : d.label, isAll?'year-val no-data':''));
    }
    tr.append(td);
  }

  /* On phones cards are the default; users can switch to the same scrollable data table.
     Both renderers use the exact same vetted public snapshot, filtered rows and paging. */
  function setMobileView(mode) {
    if (mode !== 'table' && mode !== 'cards') return;
    state.mobileView=mode;
    document.body.classList.toggle('page-view-table', mode==='table');
    viewCardsButton.setAttribute('aria-pressed', String(mode==='cards'));
    viewTableButton.setAttribute('aria-pressed', String(mode==='table'));
    tableSwipeHint.hidden = mode!=='table';
  }
  function updateClearButton() {
    clearSearch.hidden = !search.value;
  }
  function cardYear(record, yearNumber) {
    const d=statusDatum(record, yearNumber);
    const tile=text('div','','mobile-year-tile');
    tile.append(text('span',`${yearNumber}년`,'mobile-year-label'));
    tile.append(text('strong',d.value!==null?`${d.value.toFixed(1)}%`:d.label,`mobile-year-number ${d.value!==null?'available':'unavailable'}`));
    tile.setAttribute('aria-label',`${yearNumber}년: ${d.value!==null?`${d.value.toFixed(1)}%`:d.label}`);
    return tile;
  }
  function renderCards(list, start, emptyMessage = null) {
    mobileCards.replaceChildren();
    if (state.loading) {
      mobileCards.append(text('p','학교정보를 불러오는 중입니다…','mobile-empty'));
      return;
    }
    if (!list.length) {
      mobileCards.append(text('p',emptyMessage || '검색 조건에 해당하는 학교가 없습니다.','mobile-empty'));
      return;
    }
    const frag=document.createDocumentFragment();
    for (let i=0;i<list.length;i++) {
      const s=list[i];
      const record=document.createElement('article');record.className='mobile-school-card';
      const kicker=document.createElement('div');kicker.className='mobile-card-kicker';
      kicker.append(text('span',`${start+i+1}번째 학교`,'mobile-card-index'),text('span',displayRegion(s),'mobile-card-region'));
      const name=text('h3',s.school_name,'mobile-school-name');
      const detail=text('p',`${displayOffice(s)} · ${trim(s.establishment)||'설립구분 미확인'}`,'mobile-card-meta');
      const records=document.createElement('div');records.className='mobile-year-grid';
      const yr=yearsForView();
      for (const y of yr) records.append(cardYear(s,y));
      if (yr.length===3) records.classList.add('three-years');
      const statusBox=document.createElement('div');statusBox.className='mobile-card-bottom';
      const vals=yr.map(y=>statusDatum(s,y));
      let stateOfRecords=vals[0];
      if(yr.length>1){
        const visible=vals.filter(d=>d.kind==='yes').length;
        stateOfRecords=visible?{kind:'yes',label:`${visible}개년 공개`}:vals.some(d=>d.kind==='failure')?
          {kind:'failure',label:'연결 오류'}:vals.some(d=>d.kind==='pending')?
          {kind:'pending',label:'검수 중'}:{kind:'empty',label:'자료 없음'};
      }
      const show=text('button','학교 기본정보 보기','mobile-info-button');show.type='button';
      show.setAttribute('aria-label',`${s.school_name} 기본정보 보기`);
      show.addEventListener('click',()=>openInfo(s,show));
      statusBox.append(statusPill(stateOfRecords),show);
      record.append(kicker,name,detail,records,statusBox);
      frag.append(record);
    }
    mobileCards.append(frag);
  }
  function restoreResultsPosition() {
    const target = $('resultHeading');
    if (target && typeof target.scrollIntoView === 'function') {
      const reduce=typeof window.matchMedia==='function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});
    }
  }

  function emptyRow(message) {
    schoolRows.replaceChildren();
    const tr=document.createElement('tr');
    const td=cell(tr,message,'loading-cell');
    td.colSpan = state.selectedYear === 'all' ? 10 : 8;
    schoolRows.append(tr);
    renderCards([],0,message);
  }
  function summaryAndPagination(total,pages) {
    const start = total ? state.page * state.pageSize+1 : 0;
    const end = Math.min((state.page+1)*state.pageSize,total);
    const summary = state.loading ? '학교 목록을 불러오는 중입니다.' :
      `총 ${state.directoryTotal.toLocaleString('ko-KR')}개 학교 · 검색 결과 ${total.toLocaleString('ko-KR')}개${total ? ` · ${start.toLocaleString('ko-KR')}–${end.toLocaleString('ko-KR')} 표시` : ''}`;
    $('resultSummary').textContent = summary;
    $('pageLabel').textContent = pages ? `${state.page+1} / ${pages}` : '0 / 0';
    $('prevPage').disabled = state.loading || state.page<=0;
    $('nextPage').disabled = state.loading || state.page+1>=pages;
  }
  function render() {
    renderHeader();
    if (state.loading) { emptyRow('학교정보를 불러오는 중입니다…'); summaryAndPagination(0,0); return; }
    state.filtered = getSorted();
    const total = state.filtered.length;
    const pages = Math.ceil(total/state.pageSize);
    if (state.page >= pages) state.page = Math.max(0,pages-1);
    summaryAndPagination(total,pages);
    if (!total) { emptyRow('검색 조건에 해당하는 학교가 없습니다.'); return; }
    schoolRows.replaceChildren();
    const fragment=document.createDocumentFragment();
    const begin=state.page*state.pageSize;
    const list=state.filtered.slice(begin,begin+state.pageSize);
    for (let i=0;i<list.length;i++) {
      const s=list[i];
      const tr=document.createElement('tr');
      cell(tr,begin+i+1,'col-number');
      const nameTd=document.createElement('td');
      nameTd.className='col-school';
      const title = document.createElement('span'); title.className='school-title';
      title.append(text('span',s.school_name));
      nameTd.append(title); tr.append(nameTd);
      cell(tr,displayRegion(s));
      cell(tr,displayOffice(s));
      cell(tr,trim(s.establishment)||'—');
      const yrs=yearsForView();
      const vals=yrs.map(y=>statusDatum(s,y));
      vals.forEach(d=>percentCell(tr,d,yrs.length>1));
      const statusCell=document.createElement('td');statusCell.className='status-cell';
      let summary = vals[0];
      if (yrs.length>1) {
        const published=vals.filter(d=>d.kind==='yes').length;
        summary = published ? {kind:'yes',label:`${published}개년 공개`} : vals.some(d=>d.kind==='failure')?
          {kind:'failure',label:'연결 오류'}: vals.some(d=>d.kind==='pending')?
          {kind:'pending',label:'검수 중'}:{kind:'empty',label:'자료 없음'};
      }
      statusCell.append(statusPill(summary)); tr.append(statusCell);
      const action=document.createElement('td');action.className='action-cell';
      const b=text('button','기본정보','detail-button'); b.type='button';
      b.setAttribute('aria-label',`${s.school_name} 기본정보 보기`);
      b.addEventListener('click',()=>openInfo(s,b));
      action.append(b);tr.append(action);
      fragment.append(tr);
    }
    schoolRows.append(fragment);
    renderCards(list,begin);
  }
  function setOffices() {
    const r=region.value;
    const officeValues = r ? [...new Set(state.schools.filter(s=>displayRegion(s)===r).map(displayOffice))].sort(collator.compare) : [];
    const previouslySelected=office.value;
    office.replaceChildren(new Option(r ? '전체 교육지원청' : '시도를 먼저 선택',''));
    officeValues.forEach(name => office.add(new Option(name,name)));
    office.disabled=!r;
    office.value=officeValues.includes(previouslySelected) ? previouslySelected : '';
  }
  function populateRegions() {
    const available=new Set(state.schools.map(displayRegion));
    const ordering=[...regions.filter(r=>available.has(r)), ...[...available].filter(r=>!regions.includes(r)).sort(collator.compare)];
    region.replaceChildren(new Option('전국',''));
    ordering.forEach(r=>region.add(new Option(r,r)));
  }
  function openInfo(s,trigger) {
    dialogInvokedBy=trigger;
    $('dialogTitle').textContent=s.school_name;
    $('dialogMeta').textContent=`${displayRegion(s)} · ${displayOffice(s)}`;
    const root=$('dialogBody'); root.replaceChildren();
    const grid=document.createElement('div');grid.className='detail-grid';
    for(const [label,value] of [['학교명',s.school_name],['시도',displayRegion(s)],['교육지원청',displayOffice(s)],['설립구분',trim(s.establishment)||'자료 없음']]){
      const box=document.createElement('div');box.className='detail-field';
      box.append(text('span',label,'label'),text('span',value,'value'));grid.append(box);
    }
    root.append(grid,text('h3','연도별 기존 공개 기록','dialog-record-head'));
    const recordGrid=document.createElement('div');recordGrid.className='record-grid';
    for (const y of [2023,2024,2025]) {
      const d=statusDatum(s,y);const card=document.createElement('div');card.className='record-card';
      card.append(text('span',`${y}년`),text('strong',d.value!==null?`${d.value.toFixed(1)}%`:'—'),text('small',d.label));recordGrid.append(card);
    }
    root.append(recordGrid);
    $('infoDialog').hidden=false;
    document.body.style.overflow='hidden';
    $('dialogClose').focus();
  }
  function closeInfo() {
    $('infoDialog').hidden=true;
    document.body.style.overflow='';
    dialogInvokedBy?.focus();
  }
  async function loadPublicSnapshot() {
    const response=await fetch('data/public-lv0-percentiles-v1.2.json',{cache:'no-cache'});
    if (!response.ok) throw new Error(`공개 백분위 요청 실패 (${response.status})`);
    const data=await response.json();
    if (!window.BeaguPublic || typeof BeaguPublic.buildIndex !== 'function') throw new Error('공개본 검증 코드가 없습니다');
    const idx=BeaguPublic.buildIndex(data);
    if (idx.size === 0) throw new Error('공개본이 비어 있습니다');
    state.snapshot=idx;
    state.snapshotReady=true;
    $('snapshotLabel').textContent=`스냅샷 ${String(data.updated||'검증 공개본')}`;
  }
  async function loadDirectory() {
    if (typeof supabaseClient==='undefined') throw new Error('학교정보 데이터베이스 연결 코드가 없습니다');
    const schoolMap=new Map();
    const batch=700;
    for (let offset=0;offset<20000;offset+=batch) {
      const {data,error}=await supabaseClient.from('schools')
        .select('school_id,school_name,sido_standard,support_office,establishment,status')
        .eq('status','운영')
        .order('school_id',{ascending:true})
        .range(offset,offset+batch-1);
      if(error) throw new Error(`학교목록 조회 실패: ${error.message||'DB_ERROR'}`);
      if(!Array.isArray(data)) throw new Error('학교목록 응답 형식이 잘못되었습니다');
      for(const s of data) {
        if(!verifiedSchool(s)) continue;
        const id=String(s.school_id);
        if (schoolMap.has(id)) throw new Error('학교 식별키 중복 발견');
        schoolMap.set(id,s);
      }
      $('progressText').textContent=`학교목록 ${schoolMap.size.toLocaleString('ko-KR')}개 확인 중…`;
      if (data.length < batch) break;
    }
    state.schools=[...schoolMap.values()];
    state.directoryTotal=state.schools.length;
    if (!state.schools.length) throw new Error('학교정보가 없습니다');
  }
  function showFatal(error) {
    state.loading=false;
    $('loadProgress').hidden=true;
    state.directoryTotal=0;
    $('resultSummary').textContent='학교목록을 불러오지 못했습니다.';
    state.schools=[];
    emptyRow('학교 목록 연결에 실패했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.');
    console.error('배구지수 통계표 로딩 오류:',error);
  }
  async function init() {
    render();
    // 두 자원 모두 공개 자료다. 승인되지 않은 Supabase 내부 결과 테이블은 조회하지 않는다.
    const [directory,snapshot]=await Promise.allSettled([loadDirectory(),loadPublicSnapshot()]);
    if (directory.status==='rejected') { showFatal(directory.reason); return; }
    if (snapshot.status==='rejected') {
      state.snapshotError=snapshot.reason;
      console.error('기존 공개 백분위 확인 실패:',snapshot.reason);
    }
    populateRegions(); setOffices();
    state.loading=false; $('loadProgress').hidden=true;
    if(!state.snapshotReady){
      const notice=document.createElement('div');notice.className='load-progress';notice.setAttribute('role','alert');
      notice.textContent='기존 공개 백분위를 불러오지 못했습니다. 학교명과 지역 검색만 사용할 수 있으며, 백분위 값은 표시되지 않습니다.';
      $('dataTable').before(notice);
    }
    render();
  }
  document.querySelectorAll('[data-sort]').forEach(button=>button.addEventListener('click',()=>{
    const key=button.dataset.sort;
    if(!['school_name','sido_standard','support_office','establishment'].includes(key))return;
    if(state.sortBy===key) state.ascending=!state.ascending;
    else {state.sortBy=key;state.ascending=true;}
    state.page=0;render();
  }));
  search.addEventListener('input',()=>{updateClearButton();clearTimeout(debounceTimer);debounceTimer=setTimeout(()=>{state.page=0;render();},180)});
  clearSearch.addEventListener('click',()=>{search.value='';updateClearButton();clearTimeout(debounceTimer);state.page=0;render();search.focus();});
  viewCardsButton.addEventListener('click',()=>setMobileView('cards'));
  viewTableButton.addEventListener('click',()=>setMobileView('table'));
  region.addEventListener('change',()=>{setOffices();state.page=0;render()});
  office.addEventListener('change',()=>{state.page=0;render()});
  year.addEventListener('change',()=>{state.selectedYear=year.value;state.page=0;render()});
  size.addEventListener('change',()=>{state.pageSize=Number(size.value)||25;state.page=0;render()});
  $('resetFilters').addEventListener('click',()=>{search.value='';updateClearButton();region.value='';setOffices();year.value='2025';size.value='25';state.selectedYear='2025';state.pageSize=25;state.sortBy='school_name';state.ascending=true;state.page=0;render()});
  $('prevPage').addEventListener('click',()=>{if(state.page>0){state.page--;render();restoreResultsPosition();}});
  $('nextPage').addEventListener('click',()=>{if((state.page+1)*state.pageSize<state.filtered.length){state.page++;render();restoreResultsPosition();}});
  $('dialogClose').addEventListener('click',closeInfo);
  $('dialogDismiss').addEventListener('click',closeInfo);
  $('infoDialog').addEventListener('click',event=>{if(event.target===$('infoDialog'))closeInfo()});
  document.addEventListener('keydown',event=>{
    if ($('infoDialog').hidden) return;
    if (event.key==='Escape') {closeInfo();return;}
    if (event.key!=='Tab') return;
    const controls=[$('dialogClose'),$('dialogDismiss')].filter(e=>!e.disabled);
    if(!controls.length)return;
    const first=controls[0], last=controls[controls.length-1];
    if (event.shiftKey && document.activeElement===first) {event.preventDefault();last.focus();}
    else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
  });
  setMobileView('cards');
  updateClearButton();
  init();
})();
