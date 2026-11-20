/* Complete 2027 spring-summer revised classroom novel: 36 canonical scenes.
 * Story text contains only dialogue/narration. Stage directions remain invisible
 * in class-diary-scene-direction-v1.js. The existing v1 novel stays available for
 * saves created before this manuscript was introduced.
 */
(function(root){
'use strict';
const VERSION='class-diary-reconstructed-2027/v1';
const ACTS=Object.freeze(['이상한 교실','아이들의 세계','웃다가 울다가','그럴 줄 몰랐다','학교라는 사회','조금씩 자란다']);
const parts=[root.BeaguClassDiaryRewrittenAct1,root.BeaguClassDiaryRewrittenAct2,
 root.BeaguClassDiaryRewrittenAct3,root.BeaguClassDiaryRewrittenAct4,
 root.BeaguClassDiaryRewrittenAct5,root.BeaguClassDiaryRewrittenAct6];
const MAP=root.BeaguClassDiaryBranchMap;
if(parts.some(x=>!Array.isArray(x))||!MAP)throw Error('RECONSTRUCTED_ACT_DEPENDENCY_MISSING');
const SCENES=Object.freeze(parts.flat().map(x=>Object.freeze(x)));
function scene(episode){return SCENES[Number(episode)-1]||null;}
function validate(){
 if(SCENES.length!==36||new Set(SCENES.map(s=>s.n)).size!==36)throw Error('INVALID_SCENE_COUNT');
 for(let i=0;i<SCENES.length;i++){
  const s=SCENES[i],reference=MAP.episode(i+1);
  if(!reference||s.n!==i+1||s.title!==reference.title||
   !/^\d{2}-\d{2}$/.test(s.date)||!s.place||!s.visual||
   !Array.isArray(s.lines)||s.lines.length<7||s.lines.some(l=>typeof l!=='string'||l.length<25)||
   !Array.isArray(s.outcomes)||s.outcomes.length!==3||s.outcomes.some(o=>typeof o!=='string'||o.indexOf('. ')<0))
   throw Error('INVALID_RECONSTRUCTED_EPISODE_'+(i+1));
  if(s.lines.some(l=>/^\s*\[(BGM|SFX|전환|연출|행동|음향)\b/.test(l)))throw Error('ACTION_AS_SUBTITLE_'+s.n);
 }
 return {episodes:36,acts:6,choices:108};
}
validate();
const api=Object.freeze({VERSION,ACTS,SCENES,scene,validate});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryReconstructed=api;
})(typeof window!=='undefined'?window:globalThis);
