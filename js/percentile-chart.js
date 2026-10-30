/* Shared public percentile line chart. Lv.0: 2023-2025; authenticated: 2023-2026. */
function percentileChart(input) {
  const values = Array.isArray(input) ? input.slice(0, 4) : [];
  const isFour = values.length === 4;
  const years = isFour ? [2023, 2024, 2025, 2026] : [2023, 2024, 2025];
  const x = isFour ? [48, 128, 208, 288] : [48, 160, 272];
  const valid = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
  const y = v => 138 - v * 1.08;
  const summary = years.map((year, i) =>
    year + ': ' + (valid(values[i]) ? values[i].toFixed(1) + '%' : '자료 준비 중')
  ).join(', ');
  let svg = '<svg viewBox="0 0 320 180" role="img" aria-label="연도별 백분위 변화 ' +
    summary + '" style="width:100%;display:block">';
  for (const tick of [0, 50, 100]) {
    svg += '<line x1="38" x2="300" y1="' + y(tick) + '" y2="' + y(tick) +
      '" stroke="#dbe3ef"/><text x="4" y="' + (y(tick) + 4) +
      '" font-size="11" fill="#64748b">' + tick + '</text>';
  }
  for (let i = 0; i < years.length; i++) {
    if (i > 0 && valid(values[i - 1]) && valid(values[i])) {
      svg += '<line x1="' + x[i - 1] + '" y1="' + y(values[i - 1]) +
        '" x2="' + x[i] + '" y2="' + y(values[i]) +
        '" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/>';
    }
    if (valid(values[i])) {
      svg += '<circle cx="' + x[i] + '" cy="' + y(values[i]) +
        '" r="5" fill="#2563eb"/><text x="' + x[i] + '" y="' +
        (y(values[i]) - 10) +
        '" text-anchor="middle" font-size="11" fill="#1e40af">' +
        values[i].toFixed(1) + '%</text>';
    } else {
      svg += '<text x="' + x[i] + '" y="92" text-anchor="middle" font-size="10" fill="#64748b">준비 중</text>';
    }
    svg += '<text x="' + x[i] + '" y="165" text-anchor="middle" font-size="12" fill="#475569">' +
      years[i] + '</text>';
  }
  return svg + '</svg>';
}
