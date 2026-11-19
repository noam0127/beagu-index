/* Lightweight original SD cast for Class Diary quick release. No network or storage. */
(function(root){
'use strict';
const VERSION='class-diary-sd/v1';
const CAST=Object.freeze({
 woman:{name:'서지윤',hair:'#725143',coat:'#eee1cb',skin:'#f8d9c2',style:'half'},
 man:{name:'한현우',hair:'#463732',coat:'#344a69',skin:'#f4d0b7',style:'short'},
 none:{name:'윤민서',hair:'#34343b',coat:'#adbea0',skin:'#f7d7c3',style:'bob'}
});
const EXPRESSIONS=['neutral','smile','worried','flustered','tired','shy'];
function portraitSvg(who,expression){
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
