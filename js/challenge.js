(() => {
  const status = document.getElementById('status');
  const capture = document.getElementById('capture');
  const loungeFallback = document.getElementById('loungeFallback');
  const copyFallback = document.getElementById('copyFallback');
  const home = 'https://baeguindex.com/';
  const lounge = 'https://indischool.com/tweets/channels/lounge';
  let imageUrl = null;

  // The image is prepared before the button is enabled so download,
  // clipboard, and new tab can all start within the same user gesture.
  async function prepareImage() {
    if (typeof html2canvas !== 'function') {
      throw new Error('이미지 생성 기능을 불러오지 못했습니다.');
    }
    await document.fonts.ready;
    const canvas = await html2canvas(document.getElementById('certificate'), {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false
    });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('인증 이미지를 생성하지 못했습니다.');
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = URL.createObjectURL(blob);
    capture.disabled = false;
    status.textContent = '인증 이미지가 준비됐습니다. 버튼을 누르면 저장·링크 복사·라운지 열기를 진행합니다.';
  }

  async function join() {
    try {
      if (!window.beaguVisitor) {
        throw new Error('브라우저 저장 공간을 허용한 뒤 다시 접속해 주세요.');
      }
      const { data, error } = await supabaseClient.rpc('beagu_join_challenge', {
        p_visitor: window.beaguVisitor
      });
      const n = Number(data);
      if (error || !Number.isSafeInteger(n) || n < 1) {
        throw new Error('참여 기록 연결을 확인하지 못했습니다. 다시 접속해 주세요.');
      }
      document.getElementById('participantNo').textContent = n.toLocaleString('ko-KR') + '번째';
      status.textContent = '인증 이미지를 준비하는 중입니다.';
      await prepareImage();
    } catch (e) {
      capture.disabled = true;
      status.textContent = e.message;
    }
  }

  capture.addEventListener('click', () => {
    if (!imageUrl) {
      status.textContent = '아직 인증 이미지가 준비되지 않았습니다.';
      return;
    }

    // Avoid awaits here: mobile browsers frequently block downloads/popups
    // when the original user activation has already expired.
    const downloadLink = document.createElement('a');
    downloadLink.href = imageUrl;
    downloadLink.download = '2026-배구지수-챌린지.png';
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();

    let copied;
    try {
      copied = navigator.clipboard?.writeText
        ? navigator.clipboard.writeText(home).then(() => true, () => false)
        : Promise.resolve(false);
    } catch (_) {
      copied = Promise.resolve(false);
    }

    let tab = null;
    try {
      tab = window.open(lounge, '_blank');
      if (tab) tab.opener = null;
    } catch (_) { /* Show the fallback instead. */ }
    loungeFallback.hidden = Boolean(tab);
    status.textContent = '인증 이미지 다운로드를 요청했습니다. 다운로드 폴더를 확인하세요.';

    copied.then(ok => {
      copyFallback.hidden = ok;
      status.textContent = ok
        ? '인증 이미지 저장을 요청했고 대문 링크를 복사했습니다. 라운지에서 인증해 주세요.'
        : '이미지 저장을 요청했습니다. 대문 링크 자동 복사가 차단되어 직접 복사해 주세요.';
    });
  });

  window.addEventListener('pagehide', () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, { once: true });
  join();
})();
