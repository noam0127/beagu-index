function percentileChart(values) {
  const years=[2023,2024,2025], x=[48,160,272];
  const valid=v=>typeof v==='number' && Number.isFinite(v) && v>=0 && v<=100;
  const y=v=>138-v*1.08;
  const summary=years.map((yr,i)=>`${yr}: ${valid(values[i])?values[i].toFixed(1)+'%':'자료 없음'}`).join(', ');
  let svg='<svg viewBox="0 0 320 180" role="img" aria-label="연도별 백분위 그래프 '+summary+'" style="width:100%;display:block">';
  for(const v of [0,50,100])svg+=`<line x1="38" x2="292" y1="${y(v)}" y2="${y(v)}" stroke="#dbe3ef"/><text x="4" y="${y(v)+4}" font-size="11" fill="#64748b">${v}</text>`;
  for(let i=0;i<3;i++) {
    if(i>0&&valid(values[i-1])&&valid(values[i])) svg+=`<line x1="${x[i-1]}" y1="${y(values[i-1])}" x2="${x[i]}" y2="${y(values[i])}" stroke="#2563eb" stroke-width="3"/>`;
    if(valid(values[i]))svg+=`<circle cx="${x[i]}" cy="${y(values[i])}" r="5" fill="#2563eb"/><text x="${x[i]}" y="${y(values[i])-10}" text-anchor="middle" font-size="12" fill="#1e40af">${values[i].toFixed(1)}%</text>`;
    else svg+=`<text x="${x[i]}" y="90" text-anchor="middle" font-size="11" fill="#64748b">자료 없음</text>`;
    svg+=`<text x="${x[i]}" y="165" text-anchor="middle" font-size="12" fill="#475569">${years[i]}</text>`;
  }
  return svg+'</svg>';
}
