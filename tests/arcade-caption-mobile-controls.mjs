import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const diary=read('teacher-class-diary-play.html'),css=read('styles/class-diary-subtitle-lite-v1.css');
const volley=read('teacher-volleyball.html'),run=read('teacher-run.html');
assert.match(diary,/styles\/class-diary-subtitle-lite-v1\.css\?v=20261123-lite1/);
assert(diary.indexOf('class-diary-subtitle-lite-v1.css')>diary.indexOf('class-diary-cast-distinct-v5.css'));
assert.match(css,/top:auto!important/);
assert.match(css,/max-height:min\(34dvh,246px\)!important/);
assert.match(css,/background:rgba\(19,17,31,\.12\)!important/);
assert.match(css,/backdrop-filter:none!important/);
assert.match(css,/font-size:clamp\(13px,1\.55vw,17px\)!important/);
assert.match(css,/font-size:clamp\(12px,3\.4vw,14px\)!important/);
assert.match(css,/overflow-y:auto!important/,'long dialogue remains accessible');
assert.match(volley,/id="volley-joystick"/);
assert.match(volley,/id="volley-spike"/);assert.match(volley,/id="volley-dash"/);
assert.doesNotMatch(volley,/id="volley-mobile-jump"/);
assert.match(volley,/@media\(pointer:coarse\)\{\.court\.volleyball-playing \.volleyball-touch-controls\{display:block\}\}/);
assert.match(volley,/joystick\.addEventListener\("pointerdown"/);
assert.match(volley,/const flightAllowed=hasPlayerWings\(\)&&canPlayerJump\(\)/);
assert.match(volley,/courtElement\.classList\.toggle\("volleyball-playing",isPlaying\)/);
const start=run.indexOf('function drawReadableNotice(content,y,background,color){');
const end=run.indexOf('function draw(){',start);
assert(start>0&&end>start);
const source=run.slice(start,end);
assert.match(source,/ctx\.globalAlpha=\.07/);
assert.match(source,/const fontSize=Math\.min\(13,Math\.max\(11/);
assert.match(source,/ctx\.strokeText\(/);
const ops=[];
const ctx={save(){},restore(){},measureText:t=>({width:t.length*7}),
 strokeText:(...a)=>ops.push(['stroke',...a]),
 fillText:(...a)=>ops.push(['text',...a])};
const paint=new Function('ctx','W','roundRect',source+
 'return drawReadableNotice("학교 안에서 여러 사건이 진행됩니다",90,"rgba(12,32,52,.9)","#fff");');
const height=paint(ctx,560,(...a)=>ops.push(['panel',ctx.globalAlpha,...a]));
assert(height<=62);
assert(ops.some(a=>a[0]==='panel'&&a[1]===.07),'notice panel is transparent');
assert(ops.some(a=>a[0]==='stroke'),'caption is readable');
console.log('PASS compact transparent captions in diary/survival and joystick and attack controls');
