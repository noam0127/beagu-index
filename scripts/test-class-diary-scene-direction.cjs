/* Stage direction actions must never become dialog captions. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const d=require('../js/class-diary-scene-direction-v1.js');
assert.deepEqual(d.validate(),{episodes:36,directions:36,silentSubtitleActions:true});
for(let i=1;i<=36;i++){const row=d.DIRECTIONS[i-1];assert.equal(row.episode,i);assert.equal(typeof row.action,'string');assert.equal(d.forEpisode(i,'title','wrong'),null);assert.equal(d.forEpisode(i,'title','title').episode,i)}
const html=fs.readFileSync(path.resolve(__dirname,'../teacher-class-diary-play.html'),'utf8');
assert(html.includes('js/class-diary-scene-direction-v1.js'));
assert(html.includes('sceneDirector.forEpisode('));
assert(html.includes('sceneDirector.stage('));
assert(!/stageDirection\.action|direction\.action\s*\)|direction\.action\s*;|\.textContent\s*=\s*.*\.action/.test(html),'Direction must not enter subtitles or text');
const css=fs.readFileSync(path.resolve(__dirname,'../styles/class-diary-daily-journal-v1.css'),'utf8');
assert(css.includes('AppleMyungjo'),'Journal should look different from prose');
assert(css.includes('.daily-journal-dialog'));
console.log('PASS 36 scene music/cue/transition/action plans, no action subtitles, journal typography');
