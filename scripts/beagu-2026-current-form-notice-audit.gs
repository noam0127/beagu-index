/**
 * 2026년 구글폼 '현재' 공개 안내문 확인 — 읽기 전용.
 *
 * 설치: 2026 본조사 응답 시트에 연결된 Apps Script에 별도 파일로 추가.
 * 수동 실행: auditBeagu2026CurrentFormNotice()
 *
 * 원본 응답, 제출자, 보기 선택값은 읽지 않습니다.
 * 과거 응답 당시의 동의·공개 범위를 이 실행만으로 증명할 수 없습니다.
 * 실제 배구지수 학교별 공개, Supabase 승인, Google Form 수정은 하지 않습니다.
 */
function auditBeagu2026CurrentFormNotice() {
  const sourceId = '1T_rEz1LqX97pC9gOv33SRmspK2IizTU3wFtxA8P1pC4';
  const expectedSheet = '설문지 응답 시트1';
  const spreadsheet = SpreadsheetApp.openById(sourceId);
  const sheet = spreadsheet.getSheetByName(expectedSheet);
  if (!sheet) throw new Error('2026_RESPONSE_SHEET_NOT_FOUND');

  // Per-sheet form association avoids guessing from a form's title.
  const linkedFormUrl = sheet.getFormUrl();
  if (!linkedFormUrl || !/^https:\/\/docs\.google\.com\/forms\//.test(linkedFormUrl)) {
    throw new Error('2026_LINKED_FORM_NOT_FOUND');
  }
  const form = FormApp.openByUrl(linkedFormUrl);
  if (String(form.getDestinationId()) !== sourceId) {
    throw new Error('2026_FORM_DESTINATION_MISMATCH');
  }

  const description = String(form.getDescription() || '');
  const title = String(form.getTitle() || '');
  const noticePattern = /공개|동의|개인정보|학교별|소표본|표본|민감|익명|결과\s*발표|식별|자유서술|보호/;
  const noticeItems = form.getItems().map((item, index) => {
    const itemTitle = String(item.getTitle() || '');
    const helpText = String(item.getHelpText() || '');
    return {
      index,
      type: String(item.getType()),
      title: itemTitle,
      help_text: helpText
    };
  }).filter(item => noticePattern.test(item.title + '\n' + item.help_text));

  const digestInput = JSON.stringify({title, description, notice_items: noticeItems});
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, digestInput, Utilities.Charset.UTF_8
  );
  const sha256 = bytes.map(byte => (byte & 255).toString(16).padStart(2, '0')).join('');

  const audit = {
    survey_year: 2026,
    captured_at: new Date().toISOString(),
    evidence_kind: 'CURRENT_FORM_CONFIGURATION_ONLY',
    source_spreadsheet_id: sourceId,
    source_response_sheet: expectedSheet,
    linked_form_url: linkedFormUrl,
    public_form_url: form.getPublishedUrl(),
    form_title: title,
    form_description: description,
    notice_related_items: noticeItems,
    collects_email: form.collectsEmail(),
    publishes_response_summary: form.isPublishingSummary(),
    evidence_sha256: sha256,
    historical_form_version_verified: false,
    notice_effective_at_verified: false,
    individual_consent_verified: false,
    school_level_n1_release_authorized: false,
    publication_basis_status: 'PENDING_INDEPENDENT_REVIEW'
  };

  // Deliberately logs only form instructions, not responses, user IDs, or any survey answer.
  Logger.log(JSON.stringify(audit));
  return audit;
}
