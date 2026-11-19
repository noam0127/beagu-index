/* Original fictional male cast: same-origin lightweight WebP photo strip. No user data. */
(function(root){
 'use strict';
 const VERSION='class-diary-male-photos/v1';
 const SPRITE='assets/class-diary/characters/male-supporting-transparent-v2.webp';
 const PEOPLE=Object.freeze({
  junseo:Object.freeze({id:'junseo',name:'이준서',age:33,role:'체육전담 교사',position:'0%'}),
  dohyun:Object.freeze({id:'dohyun',name:'최도현',age:45,role:'교무부장',position:'50%'}),
  taesik:Object.freeze({id:'taesik',name:'장태식',age:58,role:'배움터지킴이',position:'100%'})
 });
 function paint(element,id){
  if(!element||!Object.prototype.hasOwnProperty.call(PEOPLE,id))throw Error('MALE_PHOTO_UNKNOWN_PERSON');
  element.style.backgroundImage='url("'+SPRITE+'")';
  element.style.backgroundPosition=PEOPLE[id].position+' 0%';
  element.style.backgroundSize='300% auto';
  element.dataset.malePerson=id;
  element.dataset.pose=id;
  return element;
 }
 const api=Object.freeze({VERSION,SPRITE,PEOPLE,paint});
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.BeaguClassDiaryMalePhotos=api;
})(typeof window!=='undefined'?window:globalThis);
