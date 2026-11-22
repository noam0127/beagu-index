/* Original fictional third-grade boy Doyun, seen only in narrative scenes naming him.
 * Four Korean-drama-style expressions; strictly visual. No game state, APIs or storage. */
(function(root){
'use strict';
const VERSION='class-diary-student-doyun/v1';
const SPRITE='assets/class-diary/characters/doyun-four-transparent-v2.webp';
const MOODS=Object.freeze(['neutral','worried','smile','speaking']);
const CELLS=Object.freeze({
 neutral:Object.freeze(['0%','0%']),
 worried:Object.freeze(['100%','0%']),
 smile:Object.freeze(['0%','100%']),
 speaking:Object.freeze(['100%','100%'])
});
const SCENES=Object.freeze({
 1:'neutral',4:'worried',9:'worried',15:'worried',
 20:'worried',24:'speaking',26:'speaking',32:'smile',35:'speaking'
});
function stateFor(episode){
 const n=Number(episode);
 if(!Number.isInteger(n)||n<1||n>36||!Object.prototype.hasOwnProperty.call(SCENES,n))return null;
 return Object.freeze({id:'doyun',name:'도윤',role:'3학년 학생',episode:n,expression:SCENES[n]});
}
function hide(node){
 if(!node)return;
 node.hidden=true;
 node.removeAttribute('data-emotion');
 node.classList.remove('with-other-guest');
}
function render(node,episode,reflection,withOtherGuest){
 if(!node)throw Error('DOYUN_STAGE_REQUIRED');
 const state=stateFor(episode);
 if(!state){hide(node);return null;}
 const coords=CELLS[state.expression];
 const photo=node.querySelector('.scene-student-photo');
 if(!photo)throw Error('DOYUN_PHOTO_REQUIRED');
 node.hidden=false;
 node.dataset.emotion=state.expression;
 node.dataset.pose=state.expression;
 node.dataset.episode=String(state.episode);
 node.classList.toggle('with-other-guest',Boolean(withOtherGuest));
 photo.style.backgroundImage='url("'+SPRITE+'")';
 photo.style.backgroundSize='200% 200%';
 photo.style.backgroundPosition=coords.join(' ');
 return state;
}
const api=Object.freeze({VERSION,SPRITE,MOODS,SCENES,stateFor,render,hide});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryStudentDoyun=api;
})(typeof window!=='undefined'?window:globalThis);
