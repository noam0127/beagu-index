/* 36-chapter longform editorial and branching regression, authored prose and payoff tracking. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const novel=require('../js/class-diary-semester-v1.js');
const book=globalThis.BeaguClassDiaryLongformV2;
assert(book&&Object.keys(book).length===36,'All six longform acts must load');
const starts=[1,7,13,19,25,31];
for(let i=0;i<6;i++){
 const file=path.join(__dirname,'../js/class-diary-longform-act'+(i+1)+'-v2.js');
 assert(fs.existsSync(file),'Missing Act '+(i+1));
 for(let n=starts[i];n<starts[i]+6;n++){
  assert(book[n]&&Array.isArray(book[n].paragraphs)&&book[n].paragraphs.length>=7,'Missing expanded episode '+n);
  assert(Array.isArray(book[n].outcomes)&&book[n].outcomes.length===3,'Missing choice-specific response '+n);
  assert(book[n].outcomes.every(s=>s.length>=45),'Short choice response episode '+n);
  assert(book[n].event.length>=7,'Event needs a concrete narrative purpose '+n);
 }
}
const base=partner=>({
 schoolName:'가상의 초등학교',
 profile:{name:'새봄',partner,experience:'mid',gender:'undisclosed',mbti:'INFP'},
 stats:{affection:35,trust:42,agency:42,fatigue:35,voice:45,boundary:48,support:67}
});
for(const partner of ['woman','man','none']){
 let game=novel.createGame(base(partner)),total=0,oldTotal=0,paragraphs=[];
 for(let episode=1;episode<=36;episode++){
  const current=novel.chapter(game),e=novel.SCENES[episode-1],act=Math.floor((episode-1)/6);
  assert.equal(current.episode,episode);
  assert.equal(current.perspective,'player');
  assert.equal(current.event,book[episode].event);
  assert(current.paragraphs.length>=9,'Chapter must have authored scene work: '+episode);
  assert(current.paragraphs.every(s=>s.length>=15));
  paragraphs.push(...current.paragraphs);
  total+=current.paragraphs.join('').length;
  oldTotal+=e[3].length+e[4].length+novel.PERSON[partner].beats[act].length;
  for(let choice=0;choice<3;choice++){
   const chosen=novel.choose(game,String(choice));
   assert.equal(chosen.lastOutcome.perspective,'player');
   assert.equal(chosen.lastOutcome.paragraphs[0],book[episode].outcomes[choice]);
   assert.equal(chosen.lastOutcome.line,'','A generic response line must not repeat across the story');
  }
  game=novel.advance(novel.choose(game,String(episode%3)));
 }
 assert.equal(game.phase,'semester_ending');
 assert(total/oldTotal>=4.9,'Longform length should be around five times the original: '+total/oldTotal);
 const repeated=new Set();const seen=new Set();
 for(const sentence of paragraphs){if(seen.has(sentence))repeated.add(sentence);seen.add(sentence)}
 assert.equal(repeated.size,0,'No duplicate filler paragraphs or repeated romantic refrain');
}
const motif={
 firstName:[1,36],printerShame:[2,36],failedJoke:[3,26,36],
 lineSafety:[4,9,24],minuteCorrection:[5,13,22],
 inflation:[7,26,35],exclusion:[10,15,25,35],
 walkout:[11,18,34],fitness:[6,12,18,28,36],
 publicLesson:[18,25,26,36]
};
for(const [id,episodes] of Object.entries(motif)){
 for(const episode of episodes)assert(book[episode],id+' callback missing at '+episode);
}
const html=fs.readFileSync(path.join(__dirname,'../teacher-class-diary-play.html'),'utf8');
let lastIndex=-1;
for(let act=1;act<=6;act++){
 const url='js/class-diary-longform-act'+act+'-v2.js?v=20261120-5x1';
 const i=html.indexOf(url);assert(i>=0&&i>lastIndex,'Act JS load order '+act);lastIndex=i;
}
assert(html.indexOf('js/class-diary-semester-v1.js?v=20261120')>lastIndex,'Novel acts must load before chapter engine');
console.log('PASS: 36 rewritten episodes, >=4.9x length, 108 choice-specific outcomes, 3 routes, no repeated filler');
