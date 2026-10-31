/* Independent yearly percentile markers (2023–2026).
 * Percentiles originate from different instruments/comparison groups. Never
 * connect them into a trend line or impute values for unpublished years.
 */
function percentileChart(input,options={}){
  const values=Array.isArray(input)?input.slice(0,4):[];
  const years=values.length===4?[2023,2024,2025,2026]:[2023,2024,2025];
  const xs=years.length===4?[48,128,208,288]:[48,160,272];
  const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100;
  const yy=v=>138-v*1.08;
  const permittedStates=new Set(['자료 없음','검수 중','미공개','불러오기 실패','확인 중','승인 전']);
  const labels=Array.isArray(options.labels)?options.labels:[];
  const missing=(i)=>{
    if(options.blank2026&&years[i]===2026)return '미공개';
    return permittedStates.has(labels[i])?labels[i]:'자료 없음';
  };
  const description=years.map((year,i)=>
    year+'년 '+(valid(values[i])?values[i].toFixed(1)+'백분위':missing(i))
  ).join('; ');
  let svg='<svg viewBox="0 0 320 180" role="img" aria-label="연도별 개별 백분위, 서로 직접 비교 불가. '+
    description+'" style="width:100%;display:block">';
  svg+='<title>연도별 개별 백분위</title><desc>각 점은 해당 연도만의 공개 승인값입니다. 연도별 조사 문항과 비교 기준이 달라 점들을 연결하거나 추세로 해석하지 않습니다.</desc>';
  for(const tick of [0,50,100]){
    svg+='<line x1="38" x2="302" y1="'+yy(tick)+'" y2="'+yy(tick)+'" stroke="#e2e8f0" stroke-dasharray="3 4"/>'+
      '<text x="5" y="'+(yy(tick)+4)+'" font-size="10" fill="#64748b">'+tick+'</text>';
  }
  for(let i=0;i<years.length;i++){
    const x=xs[i],v=values[i];
    if(valid(v)){
      // No cross-year line. Each year is an independent lollipop marker.
      svg+='<line x1="'+x+'" x2="'+x+'" y1="'+yy(0)+'" y2="'+yy(v)+
        '" stroke="#93c5fd" stroke-width="5" stroke-linecap="round"/>';
      svg+='<circle cx="'+x+'" cy="'+yy(v)+'" r="5.5" fill="#1d4ed8"/>'+
        '<text x="'+x+'" y="'+(yy(v)-11)+'" text-anchor="middle" font-size="10" font-weight="700" fill="#1e40af">'+
        v.toFixed(1)+'%</text>';
    }else{
      svg+='<circle cx="'+x+'" cy="'+yy(0)+'" r="4" fill="#cbd5e1"/>';
      svg+='<text x="'+x+'" y="96" text-anchor="middle" font-size="10" fill="#64748b">—</text>';
    }
    svg+='<text x="'+x+'" y="162" text-anchor="middle" font-size="11" fill="#475569">'+
      years[i]+'</text>';
  }
  return svg+'</svg>';
}
