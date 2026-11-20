(() => {
  'use strict';
  const key = 'beagu-visitor-v1';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const cells = [...document.querySelectorAll('[data-stat]')];
  const show = text => cells.forEach(el => { el.textContent = text; });

  // Use a stable anonymous visitor token; fall back to session storage when
  // persistent browser storage is blocked. Never invent aggregate figures.
  let visitor = null;
  for (const store of [() => localStorage, () => sessionStorage]) {
    try {
      const storage = store();
      const saved = storage.getItem(key);
      visitor = uuid.test(saved || '') ? saved : crypto.randomUUID();
      if (!uuid.test(saved || '')) storage.setItem(key, visitor);
      break;
    } catch (_) {
      visitor = null;
    }
  }
  if (!visitor) {
    window.beaguVisitor = null;
    show('저장 허용 필요');
    return;
  }
  window.beaguVisitor = visitor;

  const event = crypto.randomUUID();
  const rawPage = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/,'');
  // Preserve the existing server page categories and original visit events.
  const page = ['index','search','result','survey','challenge'].includes(rawPage)
    ? rawPage
    : ['search-lv1','search-lv2','school-report','statistics'].includes(rawPage) ? 'search' : 'index';

  // Passive site presence. Browser UUID already exists for anonymous visit counting.
  // A heartbeat is sent at most once per minute while the page is visible;
  // failures never delay page content, search, or the existing visit counter.
  let presencePending=false;
  const presencePage=/^[a-z0-9-]{1,48}$/.test(rawPage)?rawPage:'other';
  async function presencePing(){
    if(presencePending || document.visibilityState!=='visible' ||
       typeof supabaseClient==='undefined')return;
    presencePending=true;
    try{
      await supabaseClient.functions.invoke('beagu-telemetry-v2',{
        body:{action:'ping',visitor,page:presencePage}
      });
    }catch(_){ /* nonblocking; telemetry is best effort */ }
    finally{presencePending=false}
  }
  window.setTimeout(()=>{void presencePing()},1800);
  window.setInterval(()=>{void presencePing()},60000);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')void presencePing();
  });

  const display = raw => {
    const result = Array.isArray(raw) ? raw[0] : raw;
    if (!result || typeof result !== 'object') return false;
    let valid = true;
    const values = {};
    for (const stat of ['today','month','total']) {
      const value = result[stat];
      const n = typeof value === 'number' ? value
        : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
      if (!Number.isSafeInteger(n) || n < 0) valid = false;
      values[stat] = n;
    }
    if (!valid) return false;
    for (const el of cells) {
      const n = values[el.dataset.stat];
      if (Number.isSafeInteger(n)) el.textContent = n.toLocaleString('ko-KR');
    }
    return true;
  };

  window.beaguVisitReady = (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (typeof supabaseClient === 'undefined') throw new Error('CLIENT_UNAVAILABLE');
        // Reuse the same event UUID on retries, preventing duplicate visit events.
        const {data,error} = await supabaseClient.functions.invoke('beagu-telemetry-v2', {body:{action:'visit',visitor,event,page}});
        if (error) throw error;
        if (display(data)) return data;
        throw new Error('INVALID_VISIT_STATS');
      } catch (_) {
        if (attempt === 2) {
          show('집계 확인 불가');
          return null;
        }
        await new Promise(resolve => setTimeout(resolve, 900 * (attempt + 1)));
      }
    }
    return null;
  })();
})();
