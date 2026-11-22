/* Fictional male-character visual-only art across a 36-episode semester. */
(function(root){
'use strict';
const VERSION='class-diary-semester-male-art/v1';
const SPRITE='assets/class-diary/characters/hyunwoo-six-transparent-v2.webp';
const EXPRESSIONS=Object.freeze(['neutral','smile','worried','flustered','tired','shy']);
const CELLS=Object.freeze({neutral:['0%','0%'],smile:['50%','0%'],worried:['100%','0%'],flustered:['0%','100%'],tired:['50%','100%'],shy:['100%','100%']});
const MOODS=Object.freeze([
'neutral','smile','worried','neutral','worried','shy',
'smile','neutral','worried','worried','worried','shy',
'neutral','worried','tired','worried','worried','tired',
'tired','worried','worried','neutral','tired','neutral',
'worried','neutral','tired','tired','worried','smile',
'tired','neutral','shy','shy','smile','smile']);
const GUESTS=Object.freeze({
 6:{id:'taesik',expression:'neutral'},16:{id:'junseo',expression:'worried'},
 20:{id:'dohyun',expression:'worried'},26:{id:'dohyun',expression:'neutral'},28:{id:'taesik',expression:'smile'}
});
function valid(n){return Number.isInteger(n)&&n>=1&&n<=36}
function expressionFor(episode,reflection,choice){
 if(!valid(episode))return 'neutral';
 if(reflection&&String(choice)==='1')return 'smile';
 if(reflection&&String(choice)==='2')return 'tired';
 return MOODS[episode-1];
}
function guestFor(episode,reflection){return reflection||!valid(episode)?null:GUESTS[episode]||null}
function paint(node,expression,season){
 if(!node||!node.style)throw Error('MALE_ART_NODE_REQUIRED');
 const type=Object.prototype.hasOwnProperty.call(CELLS,expression)?expression:'neutral';
 node.style.backgroundImage='url("'+SPRITE+'")';
 node.style.backgroundSize='300% 200%';
 node.style.backgroundPosition=CELLS[type].join(' ');
 node.dataset.expression=type;
 node.dataset.pose=type;
 node.dataset.season=season||'cold-spring';
 return node;
}
let status='idle',listeners=[];
function preload(callback){
 if(typeof callback!=='function')throw Error('MALE_LOAD_CALLBACK_REQUIRED');
 if(status==='ready'){callback();return true}
 if(status==='failed')return false;
 listeners.push(callback);
 if(status==='loading')return true;
 if(typeof Image!=='function'){status='failed';listeners=[];return false}
 status='loading';const photo=new Image();
 photo.onload=()=>{status='ready';const q=listeners;listeners=[];q.forEach(fn=>fn())};
 photo.onerror=()=>{status='failed';listeners=[]};
 photo.src=SPRITE;return true;
}
if(MOODS.length!==36)throw Error('MALE_MOOD_COUNT');
const api=Object.freeze({VERSION,SPRITE,EXPRESSIONS,MOODS,GUESTS,expressionFor,guestFor,paint,preload});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiarySemesterMaleArt=api;
})(typeof window!=='undefined'?window:globalThis);
