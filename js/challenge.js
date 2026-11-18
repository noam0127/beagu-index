(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const status = byId('status'), capture = byId('capture'), retry = byId('retry');
  const participantNo = byId('participantNo');
  let imageUrl = null, participant = null, busy = false, accessGranted = false;
  const deadline = (promise, ms, message) => {
    let timer;
    return Promise.race([Promise.resolve(promise), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })]).finally(() => clearTimeout(timer));
  };

  async function prepare() {
    if (!accessGranted || busy) return;
    busy = true;
    capture.disabled = true;
    retry.hidden = true;
    retry.disabled = true;
    try {
      if (!window.beaguVisitor) throw new Error('STORAGE_UNAVAILABLE');
      if (participant === null) {
        status.textContent = '참여 순번을 확인하고 있습니다.';
        const {data, error} = await deadline(supabaseClient.rpc('beagu_join_challenge', {
          p_visitor: window.beaguVisitor
        }), 15000, '연결이 지연되고 있습니다. 다시 시도해주세요.');
        if (!accessGranted) return;
        const n = Number(data);
        if (error || !Number.isSafeInteger(n) || n < 1) throw new Error('참여 순번을 확인하지 못했습니다. 다시 시도해주세요.');
        participant = n;
        participantNo.textContent = n.toLocaleString('ko-KR') + '번째';
        if(window.BeaguChallengeProgress)void window.BeaguChallengeProgress.refresh();
      }
      if (!accessGranted) return;
      status.textContent = '인증 이미지를 준비하고 있습니다.';
      if (typeof html2canvas !== 'function') throw new Error('이미지 기능을 불러오지 못했습니다. 페이지를 새로고침해주세요.');
      if (document.fonts) await deadline(document.fonts.ready, 10000, '글꼴 로딩이 지연되고 있습니다. 다시 시도해주세요.');
      const canvas = await deadline(html2canvas(byId('certificate'), {
        scale: 2, backgroundColor: '#ffffff', logging: false
      }), 20000, '이미지 생성이 지연되고 있습니다. 다시 시도해주세요.');
      const blob = await deadline(new Promise(resolve => canvas.toBlob(resolve, 'image/png')), 10000, '이미지 변환에 실패했습니다. 다시 시도해주세요.');
      if (!blob) throw new Error('이미지를 생성하지 못했습니다. 다시 시도해주세요.');
      if (!accessGranted) return;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      imageUrl = URL.createObjectURL(blob);
      capture.disabled = false;
      status.textContent = '';
    } catch (error) {
      if (participant === null) participantNo.textContent = '순번 조회 실패';
      status.textContent = error.message === 'STORAGE_UNAVAILABLE'
        ? '브라우저 저장 공간을 허용한 뒤 페이지를 새로고침해주세요.'
        : error.message || '처리하지 못했습니다. 다시 시도해주세요.';
      retry.hidden = false;
    } finally {
      busy = false;
      retry.disabled = false;
    }
  }

  capture.addEventListener('click', () => {
    if (!accessGranted || !imageUrl) return;
    try {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = '2026-배구지수-챌린지.png';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      status.textContent = '이미지 저장을 요청했습니다. 브라우저의 다운로드 목록에서 확인해 주세요.';
    } catch (_) {
      status.textContent = '이미지 저장에 실패했습니다. 다시 시도해주세요.';
    }
  });

  retry.addEventListener('click', prepare);
  // 뒤로가기로 복원되는 페이지에서는 이미지 URL을 유지합니다.
  window.addEventListener('pagehide', event => {
    if (!event.persisted && imageUrl) URL.revokeObjectURL(imageUrl);
  });
  window.addEventListener('beagu:challenge-access-revoked', () => {
    accessGranted = false;
    participant = null;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = null;
    capture.disabled = true;
    participantNo.textContent = '순번 확인 중';
    status.textContent = '';
    retry.hidden = true;
  });
  window.addEventListener('beagu:challenge-access-granted', () => {
    accessGranted = true;
    void prepare();
  });
})();

