'use strict';
const a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sem=require('../js/class-diary-semester-v1.js'),male=require('../js/class-diary-semester-male-art-v1.js');
a.equal(sem.validate().episodes,36);a.equal(male.MOODS.length,36);
for(let i=1;i<=36;i++){a(male.EXPRESSIONS.includes(male.expressionFor(i,false,null)));a.equal(male.guestFor(i,true),null)}
a.equal(male.expressionFor(17,false,null),'worried');a.equal(male.expressionFor(34,false,null),'shy');
a.equal(male.guestFor(16,false).id,'junseo');
const source=fs.readFileSync(require.resolve('../js/class-diary-semester-male-art-v1.js'),'utf8');
for(const k of ['localStorage','sessionStorage','indexedDB','fetch(','XMLHttpRequest','navigator.sendBeacon'])a(!source.includes(k));
const img=fs.readFileSync(path.join(__dirname,'..',male.SPRITE));
a.equal(img.toString('ascii',0,4),'RIFF');a.equal(img.toString('ascii',8,12),'WEBP');
const ui=fs.readFileSync(path.join(__dirname,'../teacher-class-diary-play.html'),'utf8');
for(const k of ['id="sceneHyunwooLive"','id="setupHyunwooLive"','semesterArt.guest||maleSemester.guestFor','class-diary-semester-male-art-v1.js'])a(ui.includes(k));
console.log('PASS: 36-chapter male art, 6 expressions, stage cameos, offline state');
