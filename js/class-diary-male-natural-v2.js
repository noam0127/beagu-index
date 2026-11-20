/* Korean live-action drama photo poses for original fictional adult teachers.
 * No player data, storage, network requests, or changes to the 36-episode engine. */
(function(root){
'use strict';
const VERSION='class-diary-male-natural/v2';
const POSES=Object.freeze({
 man:Object.freeze(['neutral','smile','shy','explaining','thinking','tired','listening','notebook']),
 man2:Object.freeze(['greeting','string-game','preparing','listening','thinking','demonstrating','smiling','bashful']),
 man3:Object.freeze(['greeting','volleyball','explaining','clipboard','awkward','thinking','listening','relaxed'])
});
const ASSETS=Object.freeze({
 man:Object.freeze({name:'한현우',src:'assets/class-diary/characters/hyunwoo-poses-v2.webp',columns:4,rows:2}),
 man2:Object.freeze({name:'차도겸',src:'assets/class-diary/characters/dogyeom-poses-v2.webp',columns:8,rows:1}),
 man3:Object.freeze({name:'백태오',src:'assets/class-diary/characters/taeo-poses-v2.webp',columns:8,rows:1})
});
const SPECIAL=Object.freeze({
 man:Object.freeze({1:0,3:3,6:2,12:2,16:6,17:4,19:5,20:5,23:5,29:6,30:1,34:2,35:1,36:7}),
 man2:Object.freeze({1:0,3:1,4:5,7:2,16:3,19:4,22:3,27:5,29:3,34:1,35:6,36:7}),
 man3:Object.freeze({1:0,3:2,6:1,9:5,16:2,19:3,22:5,27:1,29:3,30:6,34:7,35:1,36:7})
});
const DEFAULTS=Object.freeze({
 man:Object.freeze([0,1,6,3,4,2,5,7]),
 man2:Object.freeze([0,3,4,1,5,2,6,7]),
 man3:Object.freeze([0,2,6,3,5,1,4,7])
});
const status=Object.create(null);
function cast(partner){return Object.prototype.hasOwnProperty.call(ASSETS,partner)?ASSETS[partner]:null}
function poseIndex(partner,episode,reflection,choiceId){
 if(!cast(partner))return 0;
 const n=Number(episode);
 if(!Number.isInteger(n)||n<1||n>36)return 0;
 if(reflection){return String(choiceId)==='1'?6:String(choiceId)==='2'?5:7}
 return Object.prototype.hasOwnProperty.call(SPECIAL[partner],n)?SPECIAL[partner][n]:DEFAULTS[partner][(n-1)%8];
}
function poseFor(partner,episode,reflection,choiceId){
 return POSES[partner]?POSES[partner][poseIndex(partner,episode,reflection,choiceId)]:null;
}
function paint(node,partner,episode,reflection,choiceId,season){
 const asset=cast(partner);
 if(!node||!node.style||!node.dataset)throw Error('MALE_POSE_NODE_REQUIRED');
 if(!asset)throw Error('MALE_POSE_UNKNOWN_ACTOR');
 const ix=poseIndex(partner,episode,reflection,choiceId);
 const x=ix%asset.columns,y=Math.floor(ix/asset.columns);
 node.style.backgroundImage='url("'+asset.src+'")';
 node.style.backgroundRepeat='no-repeat';
 node.style.backgroundSize=(asset.columns*100)+'% '+(asset.rows*100)+'%';
 node.style.backgroundPosition=(asset.columns===1?0:100*x/(asset.columns-1))+'% '+(asset.rows===1?0:100*y/(asset.rows-1))+'%';
 node.dataset.maleAtlas='v2';
 node.dataset.maleActor=partner;
 node.dataset.pose=POSES[partner][ix];
 node.dataset.season=season||'cold-spring';
 return node;
}
function preload(partner,callback){
 const asset=cast(partner);
 if(!asset||typeof callback!=='function')throw Error('MALE_POSE_PRELOAD_ARGS');
 const existing=status[partner];
 if(existing&&existing.state==='ready'){callback();return true}
 if(existing&&existing.state==='failed')return false;
 if(existing){existing.callbacks.push(callback);return true}
 if(typeof Image!=='function')return false;
 const state=status[partner]={state:'loading',callbacks:[callback]};
 const image=new Image();image.decoding='async';
 image.onload=function(){
  state.state='ready';const callbacks=state.callbacks.splice(0);
  callbacks.forEach(function(fn){fn()});
 };
 image.onerror=function(){state.state='failed';state.callbacks.length=0};
 image.src=asset.src;return true;
}
const api=Object.freeze({VERSION,POSES,ASSETS,SPECIAL,cast,poseIndex,poseFor,paint,preload});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryMaleNatural=api;
})(typeof window!=='undefined'?window:globalThis);
