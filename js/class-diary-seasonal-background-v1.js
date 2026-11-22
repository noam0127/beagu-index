/* Class Diary: 2027 March-July scene direction, independent of narrative and stored state.
 * Existing seven-day scenes remain unchanged. Illustrated SVG is a fallback until
 * approved photorealistic WebP art exists; do not claim missing WebP is deployed.
 */
(function(root){
'use strict';
const VERSION='class-diary-seasonal-background/v1';
const LABELS=Object.freeze({
 classroom:'교실',morning:'학년연구실',meeting:'회의실',hallway:'학교 복도',
 evening:'학년연구실',weekend:'퇴근길',night:'주인공의 방',gate:'교문',
 yard:'운동장',cafe:'동네 카페',consultation:'상담 공간',bookstore:'동네 서점'
});
// Exactly one scene direction per episode. Time and weather describe visual light,
// not new narrative events or claims about real schools.
const SHOTS=Object.freeze([
 ['classroom','morning','clear'],     // 01 Mar 08
 ['morning','morning','clear'],       // 02 Mar 09
 ['classroom','day','clear'],       // 03 Mar 10
 ['hallway','day','cloudy'],        // 04 Mar 12
 ['meeting','afternoon','cloudy'],  // 05 Mar 15
 ['gate','dusk','breezy'],          // 06 Mar 19
 ['classroom','morning','clear'],   // 07 Apr 01
 ['morning','morning','clear'],     // 08 Apr 06
 ['hallway','day','cloudy'],        // 09 Apr 09
 ['classroom','afternoon','clear'], // 10 Apr 15
 ['hallway','afternoon','cloudy'],  // 11 Apr 22
 ['bookstore','dusk','clear'],      // 12 Apr 30: actual bookstore, not street
 ['meeting','afternoon','clear'],   // 13 May 04
 ['consultation','afternoon','clear'],//14 May 07
 ['classroom','afternoon','clear'], // 15 May 13
 ['yard','day','clear'],            // 16 May 18: actual playground, not gate
 ['morning','morning','clear'],     // 17 May 25
 ['weekend','dusk','clear'],        // 18 May 31
 ['hallway','day','cloudy'],        // 19 Jun 02
 ['hallway','day','cloudy'],        // 20 Jun 04
 ['consultation','afternoon','humid'],//21 Jun 09
 ['meeting','afternoon','cloudy'],  // 22 Jun 11
 ['hallway','afternoon','cloudy'],  // 23 Jun 16
 ['classroom','afternoon','humid'], // 24 Jun 18
 ['classroom','morning','humid'],   // 25 Jun 22
 ['classroom','afternoon','humid'], // 26 Jun 25
 ['morning','morning','humid'],     // 27 Jun 29
 ['gate','dusk','humid'],           // 28 Jul 01
 ['meeting','afternoon','humid'],   // 29 Jul 02
 ['classroom','morning','clear'],   // 30 Jul 06
 ['morning','morning','humid'],     // 31 Jul 07
 ['meeting','afternoon','humid'],   // 32 Jul 09
 ['weekend','dusk','humid'],        // 33 Jul 12
 ['gate','dusk','clear'],           // 34 Jul 14
 ['classroom','afternoon','clear'], // 35 Jul 15
 ['night','night','clear']          // 36 Jul 16
].map(x=>Object.freeze(x)));
const MONTHS=Object.freeze({
 '03':Object.freeze({season:'cold-spring',title:'쌀쌀한 초봄',tint:'#a5bed0',alpha:'.19',leaves:0,leaf:'#aeb599'}),
 '04':Object.freeze({season:'spring',title:'봄',tint:'#d9dabb',alpha:'.10',leaves:9,leaf:'#b0c093'}),
 '05':Object.freeze({season:'late-spring',title:'늦봄',tint:'#f6e1bc',alpha:'.08',leaves:21,leaf:'#87a973'}),
 '06':Object.freeze({season:'early-summer',title:'초여름',tint:'#b2d7c9',alpha:'.12',leaves:33,leaf:'#58926a'}),
 '07':Object.freeze({season:'summer',title:'한여름',tint:'#8dbfb0',alpha:'.14',leaves:48,leaf:'#317a59'})
});
function resolve(view){
 if(!view||!Number.isInteger(view.episode)||view.episode<1||view.episode>36)
  throw Error('SEMESTER_EPISODE_REQUIRED');
 const match=/^2027-(03|04|05|06|07)-\d{2}$/.exec(String(view.date||''));
 if(!match)throw Error('SEMESTER_DATE_REQUIRED');
 const [scene,time,weather]=SHOTS[view.episode-1];
 const current=MONTHS[match[1]];
 if(!current)throw Error('UNSUPPORTED_MONTH');
 return Object.freeze({episode:view.episode,date:view.date,month:match[1],
  scene,time,weather,season:current.season,seasonName:current.title,
  label:LABELS[scene],visual:scene});
}
function leaves(month,outdoor){
 const m=MONTHS[month],count=m.leaves;
 const brown='<g stroke="#77675b" stroke-width="10" stroke-linecap="round" fill="none">'+
 '<path d="M117 319Q139 243 164 173Q202 110 243 79M164 173Q137 123 105 100M174 158Q218 136 281 142M216 112Q249 96 280 64"/>'+
 '</g>';
 const bloom=count?Array.from({length:count},function(_,i){
   const x=108+(i*37)%166,y=76+(i*53)%162,r=month==='04'?4:month==='05'?8:month==='06'?12:14;
   return '<ellipse cx="'+x+'" cy="'+y+'" rx="'+r+'" ry="'+Math.max(3,r-3)+'" fill="'+m.leaf+'" opacity=".70"/>';
 }).join(''):'';
 return '<g opacity="'+(outdoor?'.95':'.67')+'">'+brown+bloom+'</g>';
}
function bookstoreSvg(month){
 const m=MONTHS[month];
 const books=[];
 for(let side=0;side<2;side++)for(let row=0;row<4;row++)
  for(let i=0;i<12;i++){
   const x=(side===0?44:916)+i*19,y=134+row*111;
   const colors=['#986f61','#506c72','#aa9781','#7f8877','#b6a38a'];
   books.push('<rect x="'+x+'" y="'+y+'" width="14" height="'+(69+i%3*4)+
    '" fill="'+colors[(i+row+side)%colors.length]+'"/>');
  }
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 730" aria-hidden="true">'+
 '<defs><linearGradient id="floor" x2=".3" y2="1"><stop stop-color="#e5d6bf"/><stop offset="1" stop-color="#b49b87"/></linearGradient></defs>'+
 '<rect width="1200" height="730" fill="#cdb5a0"/><rect x="312" y="100" width="576" height="460" fill="#eee7d9"/>'+
 '<rect x="389" y="94" width="425" height="386" fill="#b8c9cb"/>'+
 '<rect x="400" y="104" width="404" height="366" fill="'+m.tint+'" opacity=".36"/>'+
 leaves(month,false)+
 '<path d="M602 99V469M389 283H814" stroke="#f9efdf" stroke-width="18"/>'+
 '<path d="M0 730L404 475H800L1200 730Z" fill="url(#floor)"/>'+
 [22,895].map(x=>'<rect x="'+x+'" y="88" width="284" height="495" fill="#7e614f"/>'+[0,1,2,3,4].map(y=>'<rect x="'+(x+11)+'" y="'+(116+y*106)+'" width="260" height="9" fill="#c9ad8d"/>').join('')).join('')+
 books.join('')+
 '<rect x="390" y="470" width="419" height="22" fill="#8c6b55"/>'+
 '<path d="M520 596h160l34 24H486z" fill="#7e5f4d"/>'+
 '<path d="M594 10V89" stroke="#5f5249" stroke-width="9"/><path d="M533 77h122l-20 50h-82z" fill="#d5bd92"/>'+
 '<ellipse cx="595" cy="126" rx="140" ry="45" fill="#ffe5ad" opacity=".20"/>'+
 '</svg>';
}
function yardSvg(month){
 const m=MONTHS[month];
 const windows=[];
 for(let row=0;row<3;row++)for(let col=0;col<11;col++)
  windows.push('<rect x="'+(188+col*76)+'" y="'+(199+row*81)+'" width="52" height="56" fill="#9aadb5" stroke="#e5d9c9" stroke-width="6"/>');
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 730" aria-hidden="true">'+
 '<rect width="1200" height="730" fill="'+m.tint+'"/><path d="M0 349Q190 230 385 310Q640 210 875 315Q1060 240 1200 300V480H0Z" fill="'+m.leaf+'" opacity=".43"/>'+
 '<rect x="159" y="175" width="886" height="325" fill="#d4b7a0"/>'+
 windows.join('')+
 '<rect x="516" y="390" width="146" height="110" fill="#8f9f9e"/>'+
 '<path d="M0 480H1200V730H0Z" fill="#cfb7a0"/><path d="M0 552Q600 525 1200 552" fill="none" stroke="#f7f1e0" stroke-width="6"/>'+
 '<path d="M55 470Q97 289 144 120" stroke="#796554" stroke-width="24" fill="none"/>'+
 '<path d="M1126 500Q1088 250 1021 125" stroke="#77665a" stroke-width="25" fill="none"/>'+
 leaves(month,true)+
 '<g transform="translate(1050 15) scale(-1 1)">'+leaves(month,true)+'</g>'+
 '<path d="M322 550v80M900 550v80M322 564h578" stroke="#bdbcb7" stroke-width="8" fill="none"/>'+
 '</svg>';
}
function svg(visual,context){
 if(!visual||typeof visual.backgroundSvg!=='function')throw Error('VISUAL_REQUIRED');
 if(!context||!MONTHS[context.month])throw Error('SEASON_CONTEXT_REQUIRED');
 let base=context.scene==='bookstore'?bookstoreSvg(context.month):
  context.scene==='yard'?yardSvg(context.month):visual.backgroundSvg(context.scene);
 // The seven-day SVG fixture always paints cherry blossom circles in every
 // season. Replace this fixture detail in the semester only.
 if(context.scene!=='bookstore'&&context.scene!=='yard'){
  base=base.replace(/<g fill="#eeb8c5" opacity="\.9">[\s\S]*?<\/g>/g,
   leaves(context.month,context.scene==='gate'||context.scene==='weekend'));
 }
 const m=MONTHS[context.month];
 const light=context.time==='dusk'?'#df997c':context.time==='night'?'#334766':
  context.time==='morning'?'#cad9e1':m.tint;
 const alpha=context.time==='night'?'.32':context.time==='dusk'?'.19':m.alpha;
 const mist=context.weather==='cloudy'?'<rect width="1200" height="730" fill="#b8cad1" opacity=".11"/>':
  context.weather==='humid'?'<rect y="210" width="1200" height="520" fill="#b2cbc6" opacity=".12"/>':'';
 const veil='<rect width="1200" height="730" fill="'+light+'" opacity="'+alpha+'"/>'+mist;
 return base.replace('</svg>',veil+'</svg>');
}

/* Original full-HD photography of a fictional Korean elementary school. */
const HD_DIR='assets/class-diary/backgrounds/';
const HD_ASSETS=Object.freeze({
 classroom:'classroom-cold-spring-morning.webp',
 morning:'grade-office-morning.webp',
 meeting:'meeting-room-afternoon.webp',
 hallway:'hallway-cold-spring-day.webp',
 gate:'school-gate-dusk.webp',
 consultation:'consultation-room-day.webp',
 bookstore:'bookstore-dusk.webp',
 yard:'playground-day.webp',
 weekend:'street-dusk.webp',
 night:'bedroom-night.webp'
});
function assetFor(context){
 if(!context || !Object.prototype.hasOwnProperty.call(HD_ASSETS,context.scene))return null;
 return HD_DIR+HD_ASSETS[context.scene];
}
function dataUrl(visual,context){return visual.dataUrl(svg(visual,context))}
const api=Object.freeze({VERSION,LABELS,SHOTS,MONTHS,HD_ASSETS,resolve,assetFor,svg,dataUrl});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiarySeasonalBackground=api;
})(typeof window!=='undefined'?window:globalThis);
