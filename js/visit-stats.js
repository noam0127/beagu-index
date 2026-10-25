(() => {
  let visitor;
  try {
    visitor = localStorage.getItem('beagu-visitor-v1');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(visitor || '')) {
      visitor = crypto.randomUUID(); localStorage.setItem('beagu-visitor-v1', visitor);
    }
  } catch (_) {
    window.beaguVisitor = null;
    document.querySelectorAll('[data-stat]').forEach(el => el.textContent = '저장 허용 필요');
    return;
  }
  window.beaguVisitor = visitor;
  const event = crypto.randomUUID();
  const page = (location.pathname.split('/').pop() || 'index.html').replace('.html','');
  window.beaguVisitReady = (async () => {
    try {
      const {data,error} = await supabaseClient.rpc('beagu_record_visit', {p_visitor:visitor,p_event:event,p_page:page});
      if(error) throw error;
      for(const el of document.querySelectorAll('[data-stat]')) {
        const n = data?.[el.dataset.stat];
        el.textContent = typeof n === 'number' ? n.toLocaleString('ko-KR') : '확인 불가';
      }
    } catch (_) { document.querySelectorAll('[data-stat]').forEach(el=>el.textContent='집계 연결 대기'); }
  })();
})();
