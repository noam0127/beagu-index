/* Stage 3 story layer: 36 original dramatized revision scenes, each with a planted physical motif and later payoff. */
(function(root){'use strict';
const inNode=typeof module==='object'&&module.exports&&typeof require==='function';
const acts=inNode?[1,2,3,4,5,6].map(n=>require('./class-diary-literary-revision-act'+n+'-v1.js')):[
 root.BeaguClassDiaryRevisionAct1,root.BeaguClassDiaryRevisionAct2,root.BeaguClassDiaryRevisionAct3,
 root.BeaguClassDiaryRevisionAct4,root.BeaguClassDiaryRevisionAct5,root.BeaguClassDiaryRevisionAct6
];
if(acts.some((a,i)=>!a||a.part!==i+1||!Array.isArray(a.entries)||a.entries.length!==6))throw Error('SIX_LITERARY_ACTS_REQUIRED');
const SCENES=Object.freeze(acts.flatMap(a=>a.entries));
function get(n){return SCENES[n-1]||null;}
function validate(){
 if(SCENES.length!==36)throw Error('LITERARY_TOTAL_36_REQUIRED');
 let marks=0,returns=0;
 for(let i=0;i<SCENES.length;i++){
  const e=SCENES[i];
  if(e.n!==i+1||!Array.isArray(e.lines)||e.lines.length!==3||e.lines.some(p=>typeof p!=='string'||p.length<100)||typeof e.motif!=='string'||e.motif.length<4||!Array.isArray(e.returns))throw Error('LITERARY_SCENE_'+(i+1));
  if(i<35&&!e.returns.length)throw Error('LITERARY_UNPAID_SETUP_'+(i+1));
  for(const dest of e.returns){if(!Number.isInteger(dest)||dest<=e.n||dest>36)throw Error('INVALID_FORESHADOWING_'+e.n);returns++;}
  marks++;
 }
 return {episodes:marks,seedPayoffLinks:returns,acts:6};
}
validate();
const api=Object.freeze({SCENES,get,validate});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryLiteraryV3=api;
})(typeof window!=='undefined'?window:globalThis);