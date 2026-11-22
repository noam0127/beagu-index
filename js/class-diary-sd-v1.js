/* Lightweight original SD cast for Class Diary quick release. No network or storage. */
(function(root){
'use strict';
const VERSION='class-diary-sd/v1';
const CAST=Object.freeze({
 woman:{name:'서지윤',age:30,role:'3학년 담임',hair:'#795442',coat:'#f0dfca',skin:'#f8d9c2',style:'half'},
 man:{name:'한현우',hair:'#463732',coat:'#344a69',skin:'#f4d0b7',style:'short'},
 none:{name:'윤민서',age:29,role:'3학년 담임',hair:'#34343b',coat:'#adbea0',skin:'#f7d7c3',style:'bob'},
 suhyun:{name:'박수현',age:39,role:'3학년 부장',hair:'#282932',coat:'#858d98',skin:'#ecc6b3',style:'straight'},
 sea:{name:'오세아',age:52,role:'교감',hair:'#775446',coat:'#d6c2a9',skin:'#eac3ac',style:'round'},
 yuri:{name:'강유리',age:34,role:'행정실 주무관',hair:'#62483e',coat:'#b9a5c5',skin:'#f4d0c0',style:'bun'}
});
const EXPRESSIONS=['neutral','smile','worried','flustered','tired','shy'];
/* SD female cast: deliberately different silhouettes, facial proportions and gestures.
   Supporting actors are visuals only: no extra route or romantic choices. */
const SEASONAL_COATS=Object.freeze({
 woman:Object.freeze({'cold-spring':'#ead6bf',spring:'#f0dfca','late-spring':'#f1e1d3','early-summer':'#f5e7d9',summer:'#faf2e9'}),
 none:Object.freeze({'cold-spring':'#92a887',spring:'#adbea0','late-spring':'#bad0af','early-summer':'#c9dcc0',summer:'#dcead4'}),
 suhyun:Object.freeze({'cold-spring':'#747a86',spring:'#858d98','late-spring':'#9a9fa6','early-summer':'#b0b5bc',summer:'#c7cbd0'}),
 sea:Object.freeze({'cold-spring':'#c1ab91',spring:'#d6c2a9','late-spring':'#e1cdb7','early-summer':'#eaddc8',summer:'#f1e8d7'}),
 yuri:Object.freeze({'cold-spring':'#a38bb2',spring:'#b9a5c5','late-spring':'#cbbbd5','early-summer':'#d8cbe0',summer:'#e6daea'})
});
function femalePortraitSvg(id,x,season){
 const c=CAST[id];
 const face={
  woman:{rx:90,ry:103,y:183},none:{rx:85,ry:99,y:184},
  suhyun:{rx:93,ry:101,y:183},sea:{rx:99,ry:98,y:185},
  yuri:{rx:89,ry:103,y:184}
 }[id];
 const faceSilhouette={
  woman:'M175 80C119 80 91 119 88 183C88 245 128 286 175 289C225 286 262 244 262 182C259 118 229 80 175 80Z',
  none:'M175 82C118 82 95 119 97 184L107 232Q129 268 175 283Q221 270 243 232L253 184C255 119 231 82 175 82Z',
  suhyun:'M175 80C121 80 90 118 92 181L105 236Q130 266 175 289Q220 269 245 237L258 181C260 117 229 80 175 80Z',
  sea:'M175 86C114 86 77 119 77 185C77 256 115 285 175 286C237 286 272 255 272 184C271 121 235 86 175 86Z',
  yuri:'M175 79C124 70 86 114 88 174C88 231 114 267 175 290C237 265 262 228 263 173C263 112 226 75 175 79Z'
 }[id];
 const back={
  woman:'<path d="M82 159Q68 56 174 53Q272 51 278 164L289 329Q260 347 232 319H115Q87 345 66 325Z" fill="#795442" stroke="#634438" stroke-width="4"/><path d="M126 78Q172 45 221 79" stroke="#a57d62" stroke-width="9" fill="none"/><ellipse cx="174" cy="74" rx="28" ry="15" fill="#ac8671"/>',
  none:'<path d="M73 161Q73 59 173 57Q284 61 284 164L289 286Q265 310 238 304H109Q70 315 72 286Z" fill="#34343b" stroke="#24242a" stroke-width="5"/><path d="M88 291H266" stroke="#575962" stroke-width="6"/>',
  suhyun:'<path d="M72 156Q70 56 175 52Q280 56 286 158L291 347H246L234 291H112L103 347H62Z" fill="#282932" stroke="#202229" stroke-width="5"/><path d="M84 166L77 336M269 167L279 334" stroke="#4a4b53" stroke-width="6"/>',
  sea:'<path d="M64 165Q60 56 174 53Q285 56 290 166Q297 259 255 291L113 293Q61 270 64 165Z" fill="#775446" stroke="#5d4138" stroke-width="5"/><path d="M85 140Q100 64 175 65Q249 63 274 143" stroke="#a57d65" stroke-width="11" fill="none"/>',
  yuri:'<ellipse cx="263" cy="274" rx="55" ry="62" fill="#62483e" stroke="#4b352d" stroke-width="4"/><path d="M82 157Q72 60 174 56Q276 60 281 158L275 286H94Z" fill="#62483e" stroke="#50382f" stroke-width="5"/><ellipse cx="268" cy="283" rx="36" ry="43" fill="#866052" opacity=".6"/>'
 }[id];
 const fringe={
  woman:'<path d="M89 157Q92 89 146 79Q186 73 209 92Q240 91 270 150Q226 135 209 113Q160 159 106 155Z" fill="#795442"/><path d="M105 138Q92 209 114 277M264 137Q279 211 250 272" stroke="#795442" stroke-width="13" stroke-linecap="round" fill="none"/>',
  none:'<path d="M84 159Q85 92 145 78Q214 56 273 132Q232 132 210 111Q174 148 84 159Z" fill="#34343b"/><path d="M91 168L87 278" stroke="#34343b" stroke-width="16"/><path d="M270 163L275 274" stroke="#34343b" stroke-width="12"/>',
  suhyun:'<path d="M87 151Q84 86 147 73Q216 58 273 132Q212 124 176 116Q133 146 90 161Z" fill="#282932"/><path d="M99 146L90 306M262 146L271 318" stroke="#282932" stroke-width="17" fill="none"/>',
  sea:'<path d="M85 161Q82 81 153 76Q231 65 275 143Q233 138 218 110Q174 154 88 163Z" fill="#775446"/><path d="M98 137Q67 217 99 255M258 129Q291 214 258 255" stroke="#775446" stroke-width="18" fill="none"/>',
  yuri:'<path d="M90 162Q82 89 158 74Q215 66 269 138Q225 113 207 93Q172 149 92 163Z" fill="#62483e"/><path d="M107 139Q95 201 105 261" stroke="#62483e" stroke-width="14" fill="none"/>'
 }[id];
 const rx=id==='none'?8:id==='suhyun'?7:id==='sea'?11:id==='yuri'?12:10;
 const eyeHeight=id==='none'||id==='suhyun'?9:id==='yuri'?14:12;
 const iris=id==='none'||id==='suhyun'?'#383941':'#4b3836';
 const eyes=x==='smile'
  ?'<path d="M109 194Q128 175 147 193M201 193Q220 177 240 194" stroke="'+iris+'" stroke-width="7" stroke-linecap="round" fill="none"/>'
  :x==='tired'
  ?'<path d="M112 201Q129 196 148 201M202 201Q220 197 239 201" stroke="'+iris+'" stroke-width="6" stroke-linecap="round" fill="none"/><path d="M115 210Q131 214 146 210M204 210Q222 214 237 210" stroke="#b58d83" stroke-width="2" fill="none"/>'
  :'<ellipse cx="131" cy="197" rx="'+rx+'" ry="'+(x==='flustered'?16:eyeHeight)+'" fill="'+iris+'"/><ellipse cx="219" cy="197" rx="'+rx+'" ry="'+(x==='flustered'?16:eyeHeight)+'" fill="'+iris+'"/><circle cx="134" cy="192" r="3" fill="white"/><circle cx="222" cy="192" r="3" fill="white"/>';
 const brow=x==='worried'
 ?'<path d="M108 174l40-11M201 163l40 11" stroke="#695049" stroke-width="5" fill="none"/>'
 :id==='none'||id==='suhyun'
 ?'<path d="M110 171l38 1M201 172l39-1" stroke="#4e4040" stroke-width="5" stroke-linecap="round" fill="none"/>'
 :id==='yuri'
 ?'<path d="M111 170q18-13 37-2M201 172q19-10 40-3" stroke="#695049" stroke-width="5" fill="none"/>'
 :'<path d="M111 175q18-8 38-2M201 173q20-7 39 2" stroke="#695049" stroke-width="5" fill="none"/>';
 const mouth=x==='smile'?'<path d="M161 245q16 18 30 0" stroke="#b36c70" stroke-width="5" stroke-linecap="round" fill="none"/>':
  x==='worried'?'<path d="M161 250q16-11 30 0" stroke="#aa6b70" stroke-width="4" fill="none"/>':
  x==='flustered'?'<ellipse cx="176" cy="248" rx="8" ry="11" fill="#ad717b"/>':
  id==='none'||id==='suhyun'?'<path d="M161 247q14 2 30-2" stroke="#975f62" stroke-width="4" fill="none"/>'
  :id==='sea'?'<path d="M158 240q20 17 37-1" stroke="#a46c6b" stroke-width="4.5" fill="none"/>'
  :id==='yuri'?'<path d="M159 239q17 18 37-1" stroke="#a7626a" stroke-width="5" fill="none"/>'
  :'<path d="M165 245q12 8 25 0" stroke="#aa6b70" stroke-width="4" fill="none"/>';
 const cheeks=x==='shy'||x==='flustered'?'<ellipse cx="103" cy="225" rx="18" ry="10" fill="#e99ca8" opacity=".42"/><ellipse cx="247" cy="225" rx="18" ry="10" fill="#e99ca8" opacity=".42"/>':'';
 const glasses=id==='suhyun'?'<g fill="none" stroke="#899099" stroke-width="4"><rect x="98" y="182" width="62" height="39" rx="12"/><rect x="191" y="182" width="62" height="39" rx="12"/><path d="M160 195Q176 188 191 195M98 192L83 186M253 192L267 186"/></g>':'';
 const coatColor=(SEASONAL_COATS[id]&&SEASONAL_COATS[id][season])||c.coat;
 const clothes='<path d="M54 425Q50 315 122 301H229Q298 311 298 425Z" fill="'+coatColor+'" stroke="#6f6867" stroke-width="4"/><path d="M142 299l34 42 34-42v126h-68Z" fill="#fffaf3"/><path d="M90 348Q78 389 88 424M259 349Q271 390 262 425" stroke="#695a60" stroke-width="5" fill="none" opacity=".55"/>';
 const seasonalDetail=season==='cold-spring'
  ?'<path d="M145 295Q177 313 207 295L201 324Q179 338 151 325Z" fill="#e6ded6" stroke="#b7ada9" stroke-width="3"/><path d="M198 322L213 358" stroke="#e6ded6" stroke-width="12" stroke-linecap="round"/>'
  :season==='late-spring'
  ?'<path d="M143 304L176 337L207 304" fill="none" stroke="#e9e1d8" stroke-width="5"/><circle cx="176" cy="366" r="4" fill="#e9e1d8"/>'
  :season==='early-summer'
  ?'<path d="M123 327L145 352M224 327L202 352" stroke="#fffaf4" stroke-width="6" fill="none"/><path d="M89 384L102 385M250 385L264 384" stroke="#fff8f0" stroke-width="8" fill="none"/>'
  :season==='summer'
  ?'<path d="M139 306L176 351L211 306" fill="none" stroke="#fffdf8" stroke-width="9"/><path d="M89 350Q79 378 89 402M260 351Q272 378 260 403" stroke="#faf8f1" stroke-width="10" fill="none"/>'
  :'';
 const details={
  woman:'<path d="M160 303Q176 325 192 303" fill="none" stroke="#c6a37d" stroke-width="2"/><circle cx="176" cy="323" r="4" fill="#d6a65b"/><path d="M128 319l17 27-5 78M222 319l-17 27 5 78" stroke="#dcc7ac" stroke-width="4" fill="none"/><circle cx="233" cy="247" r="2" fill="#ab8678"/>',
  none:'<rect x="214" y="332" width="75" height="83" rx="7" fill="#e6e8d4" stroke="#607664" stroke-width="4"/><path d="M225 348H276M225 361H270M225 374H273" stroke="#a1ae99" stroke-width="3"/><circle cx="101" cy="395" r="8" fill="#343940"/>',
  suhyun:'<path d="M126 308l31 43-17 16 20 57M224 308l-30 43 17 16-20 57" stroke="#606a73" stroke-width="5" fill="none"/><rect x="235" y="341" width="56" height="77" rx="4" fill="#d8e2e3" stroke="#6e818b" stroke-width="3"/>',
  sea:'<path d="M125 307l29 45-16 15 21 57M225 307l-29 45 16 15-21 57" stroke="#ad967b" stroke-width="5" fill="none"/><path d="M166 302L176 344L188 302" fill="#d4a79c"/><rect x="224" y="344" width="61" height="76" rx="6" fill="#947154" stroke="#71503d" stroke-width="3"/>',
  yuri:'<path d="M162 323l14 24 14-24" stroke="#967da6" stroke-width="4" fill="none"/><rect x="220" y="343" width="68" height="73" rx="7" fill="#fbf7f2" stroke="#806d85" stroke-width="4"/><path d="M230 361h49M230 374h49M230 387h39" stroke="#b8a6c0" stroke-width="3"/>'
 }[id];
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 350 430" aria-hidden="true">'+
 '<ellipse cx="175" cy="418" rx="125" ry="10" fill="#28313d" opacity=".14"/>'+clothes+seasonalDetail+details+back+
 '<path d="'+faceSilhouette+'" fill="'+c.skin+'" stroke="#b89283" stroke-width="3"/>'+
 '<ellipse cx="86" cy="207" rx="12" ry="16" fill="'+c.skin+'"/><ellipse cx="263" cy="207" rx="12" ry="16" fill="'+c.skin+'"/>'+
 fringe+brow+eyes+glasses+mouth+cheeks+
 '<path d="M174 204l-5 19 8 2" fill="none" stroke="#c6978a" stroke-width="3" stroke-linecap="round"/>'+
 (id==='sea'?'<path d="M115 220q9 4 17 0M221 220q9 4 17 0" fill="none" stroke="#ba9686" stroke-width="2" opacity=".6"/>':'')+'</svg>';
}

function portraitSvg(who,expression,season){
 const femaleId=CAST[who]&&who!=='man'?who:({jiyoon:'woman',minseo:'none',park_suhyun:'suhyun',oh_sea:'sea',kang_yuri:'yuri'}[who]);
 if(femaleId)return femalePortraitSvg(femaleId,EXPRESSIONS.includes(expression)?expression:(expression==='happy'||expression==='warm'||expression==='tender'?'smile':expression==='tension'?'worried':'neutral'),season);
 const id=CAST[who]?who:'woman',c=CAST[id];
 const x=EXPRESSIONS.includes(expression)?expression:(expression==='happy'||expression==='warm'||expression==='tender'?'smile':'neutral');
 const hair=c.style==='half'
  ?'<path d="M78 177Q64 66 176 59Q290 60 278 181L292 303Q270 350 231 312L116 311Q67 341 75 267Z" fill="'+c.hair+'"/><path d="M85 130Q82 74 148 59Q173 45 199 57" stroke="#9a7863" stroke-width="13" fill="none"/>'
  :c.style==='bob'
  ?'<path d="M77 157Q70 61 173 57Q282 57 287 160L290 279Q273 316 237 302L115 302Q75 310 77 275Z" fill="'+c.hair+'"/>'
  :'<path d="M77 148Q81 98 105 92L103 70L135 78L159 54L181 73L220 57L236 82L269 77L267 107Q300 142 270 170Z" fill="'+c.hair+'"/>';
 const fringe=c.style==='half'
  ?'<path d="M91 151Q89 91 155 79Q221 72 269 142Q223 131 207 99Q167 148 107 151Z" fill="'+c.hair+'"/><path d="M103 129Q96 233 113 270" stroke="'+c.hair+'" stroke-width="14" stroke-linecap="round" fill="none"/>'
  :c.style==='bob'
  ?'<path d="M86 154Q82 96 143 80Q220 54 269 131Q232 132 211 106Q176 143 90 156Z" fill="'+c.hair+'"/>'
  :'<path d="M94 135L121 105L145 118L168 87L191 108L216 88L244 111L268 106L264 143Q237 130 220 130L197 149L163 130L141 149Z" fill="'+c.hair+'"/>';
 const eyes=x==='smile'?'<path d="M115 193q15-16 31 0M204 193q15-16 30 0" stroke="#473a39" stroke-width="7" stroke-linecap="round" fill="none"/>'
  :x==='tired'?'<path d="M111 199q18-4 37 0M201 199q18-4 36 0" stroke="#473a39" stroke-width="7" stroke-linecap="round" fill="none"/>'
  :'<ellipse cx="130" cy="196" rx="10" ry="'+(x==='flustered'?16:12)+'" fill="#443737"/><ellipse cx="217" cy="196" rx="10" ry="'+(x==='flustered'?16:12)+'" fill="#443737"/><circle cx="133" cy="191" r="3" fill="white"/><circle cx="220" cy="191" r="3" fill="white"/>';
 const mouth=x==='smile'?'<path d="M163 237q13 18 27 0" stroke="#a76368" stroke-width="5" fill="none" stroke-linecap="round"/>'
  :x==='flustered'?'<ellipse cx="175" cy="239" rx="8" ry="11" fill="#ae7377"/>'
  :x==='worried'?'<path d="M162 245q12-9 27 0" stroke="#a76368" stroke-width="4" fill="none"/>'
  :'<path d="M164 238q11 7 25 0" stroke="#a76368" stroke-width="4" fill="none"/>';
 const brows=x==='worried'?'<path d="M113 174l34-10M200 164l34 10" stroke="#644c42" stroke-width="5" stroke-linecap="round"/>'
  :'<path d="M113 173q16-7 33-2M201 171q16-5 33 2" stroke="#644c42" stroke-width="5" fill="none"/>';
 const cheeks=x==='shy'||x==='flustered'?'<ellipse cx="104" cy="219" rx="18" ry="9" fill="#e99da6" opacity=".6"/><ellipse cx="246" cy="219" rx="18" ry="9" fill="#e99da6" opacity=".6"/>':'';
 const shirt=id==='man'?'<path d="M150 286l25 48 26-48v110h-54Z" fill="#b9d5e9"/>':'<path d="M145 288l30 49 32-49v112h-62Z" fill="#fffef9"/>';
 const accessory=id==='none'?'<rect x="209" y="318" width="72" height="83" rx="8" fill="#526d65" stroke="#455d57" stroke-width="4"/><path d="M219 331h52M219 342h46" stroke="#e9e9d4" stroke-width="3"/>'
 :id==='woman'?'<circle cx="176" cy="324" r="5" fill="#d4aa76"/><path d="M158 289q18 40 36 0" fill="none" stroke="#d9bc8d" stroke-width="2"/>'
 :'<path d="M244 352l30-18M252 366l28-4" stroke="#f4dca2" stroke-width="8" stroke-linecap="round"/>';
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 350 430" aria-hidden="true">'+
 '<ellipse cx="175" cy="412" rx="123" ry="12" fill="#263442" opacity=".13"/>'+
 '<path d="M57 421Q50 291 123 282H229Q296 299 293 421Z" fill="'+c.coat+'" stroke="#675657" stroke-width="5"/>'+shirt+
 hair+'<ellipse cx="175" cy="177" rx="103" ry="114" fill="'+c.skin+'" stroke="#9b7b6d" stroke-width="3"/>'+fringe+
 brows+eyes+'<path d="M173 198l-4 21 8 2" stroke="#cc9d8d" stroke-width="3" fill="none"/>'+mouth+cheeks+
 '<circle cx="82" cy="201" r="13" fill="'+c.skin+'"/><circle cx="268" cy="201" r="13" fill="'+c.skin+'"/>'+accessory+'</svg>';
}
const api=Object.freeze({VERSION,CAST,EXPRESSIONS,portraitSvg});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiarySD=api;
})(typeof window!=='undefined'?window:globalThis);
