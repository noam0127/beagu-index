/* 36-episode background direction and privacy regression. No external dependencies. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const semester=require('../js/class-diary-semester-v1.js');
const visual=require('../js/class-diary-visual-v1.js');
const backgrounds=require('../js/class-diary-seasonal-background-v1.js');
assert.equal(backgrounds.SHOTS.length,36);
assert.deepEqual(Object.keys(backgrounds.MONTHS),['03','04','05','06','07']);
const base={
 schoolName:'가상학교',
 profile:{name:'가온',age:31,experience:'new',partner:'woman',gender:'undisclosed',mbti:'INFP'},
 stats:{affection:35,trust:42,agency:42,fatigue:35,voice:45,boundary:48,support:67}
};
let state=semester.createGame(base);
const observed=new Set();
const months=new Set(),art=new Set(),seenScenes=[];
for(let i=1;i<=36;i++){
 const view=semester.chapter(state),b=backgrounds.resolve(view);
 assert.equal(b.episode,i);assert.equal(b.date,view.date);
 assert.equal(b.month,view.date.slice(5,7));
 assert(b.seasonName&&b.label&&b.scene);
 assert(['morning','day','afternoon','dusk','night'].includes(b.time));
 assert(['clear','cloudy','breezy','humid'].includes(b.weather));
 const svg=backgrounds.svg(visual,b);
 assert(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
 assert(svg.endsWith('</svg>'));
 assert(!svg.includes('fill="#eeb8c5"'), 'Fixed March cherry-blossom SVG must not leak into any month');
 assert(backgrounds.dataUrl(visual,b).startsWith('data:image/svg+xml'));
 months.add(b.month);art.add(b.season);observed.add(b.scene);seenScenes.push(b);
 state=semester.advance(semester.choose(state,'0'));
}
assert.equal(state.phase,'semester_ending');
assert.equal(months.size,5);assert.equal(art.size,5);
assert.equal(seenScenes[0].season,'cold-spring');
assert.equal(seenScenes[5].weather,'breezy');
assert.equal(seenScenes[11].scene,'bookstore');
assert.equal(seenScenes[11].label,'동네 서점');
assert.equal(seenScenes[15].scene,'yard');
assert.equal(seenScenes[15].label,'운동장');
assert.equal(seenScenes[35].season,'summer');
assert.equal(seenScenes[35].scene,'night');
assert(observed.size>=8);
assert.notEqual(backgrounds.svg(visual,seenScenes[0]),backgrounds.svg(visual,seenScenes[34]));
const html=fs.readFileSync(path.join(__dirname,'../teacher-class-diary-play.html'),'utf8');
for(const marker of [
 'src="js/class-diary-seasonal-background-v1.js?v=20261120-36"',
 'seasonalBackground.resolve(view)',
 'seasonalBackground.dataUrl(visual,semesterBackground)',
 'stage.dataset.season=semesterBackground.season',
 "visual.dataUrl(visual.backgroundSvg(id))", // 7-day fallback remains
 "displayStage(view.visual.id,game.profile.partner" // 7-day scene still uses original
])assert(html.includes(marker),'Background wiring missing: '+marker);
const source=fs.readFileSync(require.resolve('../js/class-diary-seasonal-background-v1.js'),'utf8');
for(const fragment of ['localStorage','sessionStorage','indexedDB','fetch(','XMLHttpRequest','navigator.sendBeacon'])
 assert(!source.includes(fragment),'Background direction must not store or transmit personal data: '+fragment);
assert.throws(()=>backgrounds.resolve({episode:0,date:'2027-03-01'}),/SEMESTER_EPISODE_REQUIRED/);
assert.throws(()=>backgrounds.resolve({episode:37,date:'2027-07-17'}),/SEMESTER_EPISODE_REQUIRED/);
assert.throws(()=>backgrounds.resolve({episode:1,date:'2026-03-08'}),/SEMESTER_DATE_REQUIRED/);
console.log('PASS seasonal backgrounds: 36 episodes, 5 months, cold March to hot July, bookstore and yard, 7-day fallback, privacy');
