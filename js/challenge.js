(() => {
  const status = document.getElementById('status');
  const capture = document.getElementById('capture');
  const home = new URL('index.html', location.href).href;

  async function join() {
    try {
      if (!window.beaguVisitor) {
        throw new Error('브라우저 저장 공간을 허용한 뒤 다시 접속해 주세요.');
      }

      const { data, error } = await supabaseClient.rpc('beagu_join_challenge', {
        p_visitor: window.beaguVisitor
      });

      if (error || !Number.isSafeInteger(Number(data)) || Number(data) < 1) {
        throw new Error('참여 기록 연결을 확인하지 못했습니다. 잠시 후 다시 접속해 주세요.');
      }

      document.getElementById('participantNo').textContent =
        Number(data).toLocaleString('ko-KR') + '번째';

      capture.disabled = false;
      status.textContent = '인증 버튼을 누르면 이미지가 자동으로 저장됩니다.';
    } catch (e) {
      document.getElementById('participantNo').textContent = '순번 확인 대기';
      status.textContent = e.message;
    }
  }

  capture.addEventListener('click', async () => {
    capture.disabled = true;

    try {
      if (typeof html2canvas !== 'function') {
        throw new Error('이미지 기능을 불러오지 못했습니다.');
      }

      await document.fonts.ready;

      const canvas = await html2canvas(
        document.getElementById('certificate'),
        {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false
        }
      );

      const blob = await new Promise(resolve =>
        canvas.toBlob(resolve, 'image/png')
      );

      if (!blob) {
        throw new Error('이미지를 생성하지 못했습니다. 다시 시도해 주세요.');
      }

      const imageUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = imageUrl;
      a.download = '2026-배구지수-챌린지.png';
      document.body.appendChild(a);
      a.click();
      a.remove();

      try {
        await navigator.clipboard.writeText(home);
        status.textContent = '인증 이미지를 저장했고, 대문 링크도 복사했습니다.';
      } catch (_) {
        status.textContent = '인증 이미지를 저장했습니다. 대문 링크는 직접 복사해 주세요.';
      }

      setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
    } catch (e) {
      status.textContent = e.message;
    } finally {
      capture.disabled = false;
    }
  });

  join();
})();
