/* 2026 학교문화 16유형 — Lv.1/Lv.2 공통 공개 UI v1.
 * 서버에서 인증과 승인된 4개 축을 검증한 결과만 표시.
 * 이 파일에 비공개 설문 응답이나 인증코드를 넣지 않습니다.
 */
(function () {
  'use strict';
  const API = SUPABASE_URL + '/functions/v1/beagu-school-culture-v1';
  let activeToken = '';
  const cache = new Map();
  const e = (tag, cls, value) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (value !== undefined) n.textContent = String(value);
    return n;
  };
  function authorized(token) {
    if (activeToken !== token) { cache.clear(); activeToken = token; }
  }
  function validAxis(a) {
    return a && ['Q14','Q15','Q16','Q17'].includes(a.key) &&
      typeof a.label === 'string' && typeof a.left === 'string' &&
      typeof a.right === 'string' && typeof a.value === 'number' &&
      Number.isFinite(a.value) && a.value >= -2 && a.value <= 2;
  }
  function normal(result) {
    if (!result || typeof result !== 'object') return { status:'not_published' };
    if (result.status !== 'published' && result.status !== 'mixed') return { status:'not_published' };
    if (!Array.isArray(result.axes) || result.axes.length !== 4 ||
      new Set(result.axes.map(a => a.key)).size !== 4 || !result.axes.every(validAxis)) return {status:'not_published'};
    if (result.status === 'mixed') return {status:'mixed',axes:result.axes};
    if (typeof result.type !== 'string' || !/^[EI][SN][TF][JP]$/.test(result.type) ||
        typeof result.name !== 'string' || result.name.length > 30) return {status:'not_published'};
    // Fail closed if the server's type does not match the published axis directions.
    const values = Object.fromEntries(result.axes.map(a=>[a.key,a.value]));
    if (Object.values(values).some(v => Math.abs(v) < 0.5)) return {status:'not_published'};
    const computed = (values.Q14 > 0 ? 'E' : 'I') + (values.Q16 > 0 ? 'S' : 'N') +
      (values.Q15 > 0 ? 'T' : 'F') + (values.Q17 > 0 ? 'P' : 'J');
    return computed === result.type ? result : {status:'not_published'};
  }
  async function fetchValues(ids, token) {
    if (!token || !ids.length) return {};
    authorized(token);
    const need = [...new Set(ids)].filter(id=>/^\d{7}$/.test(id) && !cache.has(id));
    if (need.length) {
      // The server accepts at most 20 school IDs per authorized request.
      for (let i=0;i<need.length;i+=20) {
        const slice = need.slice(i,i+20);
        const response = await fetch(API, {
          method:'POST', cache:'no-store',
          headers:{'Content-Type':'application/json','X-Beagu-Session':token},
          body:JSON.stringify({action:'batch',schoolIds:slice})
        });
        if (!response.ok) throw new Error(response.status===401?'AUTH_REQUIRED':'MBTI_UNAVAILABLE');
        const data = await response.json();
        if (activeToken !== token) return {};
        for (const id of slice) cache.set(id, normal(data.values && data.values[id]));
      }
    }
    return Object.fromEntries(ids.map(id=>[id,cache.get(id) || {status:'not_published'}]));
  }
  function badgeText(result) {
    if (result.status === 'published') return result.type + ' · ' + result.name;
    if (result.status === 'mixed') return '학교문화 유형 판정 보류';
    return '2026 학교문화 유형 미공개';
  }
  // Searches render 20 results per page. One authorized batch fetch fills all card badges.
  async function decorateCards(host, token) {
    if (!host || !token) return;
    const cards = [...host.querySelectorAll('.school-card[data-school-id]')];
    if (!cards.length) return;
    const ids = [];
    for (const card of cards) {
      const id=card.dataset.schoolId || '';
      if (!/^\d{7}$/.test(id)) continue;
      ids.push(id);
      let badge=card.querySelector('.beagu-mbti-badge');
      if (!badge) {
        badge=e('div','beagu-mbti-badge');
        const meta=card.querySelector('.school-meta');
        const name=card.querySelector('.school-name');
        if (meta) meta.insertAdjacentElement('afterend',badge);
        else if (name) name.insertAdjacentElement('afterend',badge);
        else card.prepend(badge);
      }
      badge.replaceChildren(e('span','beagu-mbti-label','2026 학교 MBTI'),e('strong','beagu-mbti-text','승인 결과 확인 중…'));
      badge.classList.remove('is-ready');
    }
    try {
      const values=await fetchValues(ids,token);
      if (activeToken !== token) return;
      for (const card of cards) {
        if (!card.isConnected) continue;
        const result=values[card.dataset.schoolId] || {status:'not_published'};
        const badge=card.querySelector('.beagu-mbti-badge');
        if (!badge) continue;
        const out=badge.querySelector('.beagu-mbti-text');
        if (out) out.textContent=badgeText(result);
        badge.classList.toggle('is-ready',result.status==='published');
        badge.classList.toggle('is-mixed',result.status==='mixed');
      }
    } catch (_) {
      for (const card of cards) {
        if (!card.isConnected) continue;
        const value=card.querySelector('.beagu-mbti-text');
        if (value) value.textContent='문화유형을 불러오지 못했습니다.';
      }
    }
  }
  function renderDetail(host,result) {
    const body=e('div','beagu-mbti-body');
    if (result.status==='not_published') {
      body.append(e('p','beagu-mbti-message','이 학교의 2026년 학교문화 유형은 아직 공개 승인되지 않았습니다.'));
    } else {
      const hero=e('div','beagu-mbti-hero');
      hero.append(e('strong','beagu-mbti-type',result.status==='published'?result.type:'판정 보류'));
      hero.append(e('span','beagu-mbti-name',result.status==='published'?result.name:'네 축 중 중립적인 응답이 있어 단일 유형을 지정하지 않습니다.'));
      body.append(hero);
      const axisList=e('div','beagu-mbti-axes');
      for (const axis of result.axes) {
        const item=e('div','beagu-mbti-axis');
        item.append(e('div','beagu-mbti-axis-title',axis.label));
        const ends=e('div','beagu-mbti-ends');
        ends.append(e('span','',axis.left),e('span','',axis.right));
        item.append(ends);
        const track=e('div','beagu-mbti-track');
        const marker=e('span','beagu-mbti-marker');
        marker.style.left=((axis.value+2)/4*100)+'%';
        track.append(marker);
        track.setAttribute('role','img');
        track.setAttribute('aria-label',axis.label+': '+axis.left+'에서 '+axis.right+' 방향 척도, 평균 '+axis.value.toFixed(2));
        item.append(track);
        axisList.append(item);
      }
      body.append(axisList);
    }
    host.append(body);
  }
  function createDetail(schoolId, token) {
    const card=e('section','beagu-mbti-detail');
    card.setAttribute('aria-label','2026 학교문화 16유형');
    card.append(e('div','beagu-mbti-detail-eyebrow','2026 SCHOOL CULTURE · LV.1+'));
    card.append(e('h3','beagu-mbti-detail-title','학교 MBTI · 문화유형 16종'));
    const content=e('div','beagu-mbti-body');
    content.append(e('p','beagu-mbti-message','공개 승인 결과를 확인 중입니다…'));
    card.append(content);
    card.append(e('p','beagu-mbti-disclaimer',
      'Q14~Q17 관계·의사결정·변화도입·수업운영 응답에 근거한 학교문화 분류입니다. 개인 MBTI 검사와 동일한 척도가 아니며 학교의 우열을 뜻하지 않습니다.'));
    if (!/^\d{7}$/.test(String(schoolId)) || !token) return card;
    fetchValues([String(schoolId)],token).then(values=>{
      if (!card.isConnected || activeToken!==token) return;
      content.remove();
      const v=values[String(schoolId)]||{status:'not_published'};
      // Appends only the server-verified and approved result.
      const disclaimer=card.querySelector('.beagu-mbti-disclaimer');
      const wrapper=e('div');
      renderDetail(wrapper,v);
      for (const child of [...wrapper.children]) card.insertBefore(child,disclaimer);
    }).catch(()=>{
      if (!card.isConnected || activeToken!==token) return;
      content.replaceChildren(e('p','beagu-mbti-message','유형 정보를 불러오지 못했습니다. 다시 검색해 주세요.'));
    });
    return card;
  }
  window.BeaguSchoolMBTI=Object.freeze({decorateCards,createDetail});
})();
