/* Fictional 36-episode scene direction metadata: NEVER dialog or subtitles.
 * Action keys are internal animation instructions. Audio cues trigger at chapter
 * boundaries, not on each sentence or touch. Grade/character privacy is preserved.
 */
(function(root){
'use strict';
const VERSION='class-diary-scene-direction/v1';
const DIRECTIONS=Object.freeze([{"episode":1,"music":"quiet","ambience":"classroom","sfx":"paper","transition":"fade","action":"first_arrival","journalMusic":"restful"},{"episode":2,"music":"restful","ambience":"classroom","sfx":"step","transition":"slide","action":"move_lockers_for_rest","journalMusic":"quiet"},{"episode":3,"music":"comic","ambience":"workroom","sfx":"paper","transition":"page","action":"printer_jam","journalMusic":"daily"},{"episode":4,"music":"heartfelt","ambience":"classroom","sfx":"step","transition":"fade","action":"older_sibling_checks_younger","journalMusic":"intimate"},{"episode":5,"music":"tension","ambience":"workroom","sfx":"paper","transition":"page","action":"record_unheard_vote","journalMusic":"quiet"},{"episode":6,"music":"playful","ambience":null,"sfx":"step","transition":"slide","action":"children_follow_commute","journalMusic":"playful"},{"episode":7,"music":"quiet","ambience":null,"sfx":"door","transition":"fade","action":"evening_parent_phone","journalMusic":"restful"},{"episode":8,"music":"wildflowers","ambience":"classroom","sfx":"paper","transition":"fade","action":"family_disclosure","journalMusic":"quiet"},{"episode":9,"music":"incredulity","ambience":null,"sfx":"whistle","transition":"slide","action":"skating_cold","journalMusic":"restful"},{"episode":10,"music":"comic","ambience":"classroom","sfx":"coin","transition":"page","action":"reward_questions","journalMusic":"quiet"},{"episode":11,"music":"wildflowers","ambience":"classroom","sfx":"glass","transition":"fade","action":"bean_and_beaker","journalMusic":"restful"},{"episode":12,"music":"restful","ambience":null,"sfx":"paper","transition":"page","action":"library_overdue","journalMusic":"quiet"},{"episode":13,"music":"withhands","ambience":"classroom","sfx":"coin","transition":"page","action":"salary_roles","journalMusic":"quiet"},{"episode":14,"music":"unraveling","ambience":"classroom","sfx":"coin","transition":"slide","action":"dart_labor_conflict","journalMusic":"reconcile"},{"episode":15,"music":"quiet","ambience":"workroom","sfx":"paper","transition":"fade","action":"administrative_receipt","journalMusic":"restful"},{"episode":16,"music":"bright","ambience":"classroom","sfx":"bell","transition":"page","action":"cake_twenty_one","journalMusic":"wildflowers"},{"episode":17,"music":"quiet","ambience":"classroom","sfx":null,"transition":"fade","action":"balloon_fear_stop","journalMusic":"restful"},{"episode":18,"music":"tender","ambience":null,"sfx":"rain","transition":"fade","action":"rain_soccer_coat","journalMusic":"intimate"},{"episode":19,"music":"quiet","ambience":null,"sfx":"step","transition":"fade","action":"condolence_atm","journalMusic":"restful"},{"episode":20,"music":"incredulity","ambience":"classroom","sfx":"glass","transition":"cut","action":"glass_broken_again","journalMusic":"quiet"},{"episode":21,"music":"tension","ambience":"classroom","sfx":"paper","transition":"fade","action":"missing_tablet","journalMusic":"reconcile"},{"episode":22,"music":"tension","ambience":null,"sfx":"door","transition":"cut","action":"health_office_spray","journalMusic":"quiet"},{"episode":23,"music":"playful","ambience":null,"sfx":"whistle","transition":"slide","action":"sports_day_storage","journalMusic":"daily"},{"episode":24,"music":"daily","ambience":"classroom","sfx":"paper","transition":"page","action":"strike_substitute_lunch","journalMusic":"quiet"},{"episode":25,"music":"incredulity","ambience":"workroom","sfx":"cup","transition":"page","action":"transferred_milk_payment","journalMusic":"restful"},{"episode":26,"music":"tension","ambience":null,"sfx":"step","transition":"cut","action":"third_sixth_conflict","journalMusic":"quiet"},{"episode":27,"music":"reconcile","ambience":"workroom","sfx":"paper","transition":"fade","action":"teacher_apology","journalMusic":"restful"},{"episode":28,"music":"unraveling","ambience":null,"sfx":"rain","transition":"fade","action":"flooded_cafeteria","journalMusic":"restful"},{"episode":29,"music":"tension","ambience":null,"sfx":"door","transition":"cut","action":"hallway_safety_incident","journalMusic":"quiet"},{"episode":30,"music":"reconcile","ambience":"workroom","sfx":"door","transition":"page","action":"principal_large_office","journalMusic":"quiet"},{"episode":31,"music":"incredulity","ambience":"workroom","sfx":"paper","transition":"page","action":"representative_lesson_assignment","journalMusic":"restful"},{"episode":32,"music":"withhands","ambience":"workroom","sfx":"paper","transition":"page","action":"six_teacher_lessons","journalMusic":"quiet"},{"episode":33,"music":"tension","ambience":"classroom","sfx":"paper","transition":"fade","action":"unplanned_question","journalMusic":"reconcile"},{"episode":34,"music":"reconcile","ambience":"classroom","sfx":"pageTurn","transition":"page","action":"revise_class_council","journalMusic":"quiet"},{"episode":35,"music":"heartfelt","ambience":"classroom","sfx":"paper","transition":"fade","action":"last_student_presentations","journalMusic":"wildflowers"},{"episode":36,"music":"intimate","ambience":null,"sfx":"paper","transition":"page","action":"last_diary_entry_and_bean","journalMusic":"ending"}]);
const MUSIC=new Set(["daily","playful","heartfelt","tension","tender","restful","bright","ending","quiet","comic","intimate","reconcile","wildflowers","withhands","unraveling","incredulity"]);
const SFX=new Set(["paper","step","door","cup","whistle","coin","bell","glass","rain","pageTurn"]);
const TRANSITIONS=new Set(["fade","slide","page","cut"]);
function forEpisode(n,expectedTitle,plannedTitle){
 const e=DIRECTIONS[Number(n)-1];
 // Prevent future rewritten directions from being played over the legacy chapter text.
 if(!e||!plannedTitle||expectedTitle!==plannedTitle)return null;
 return e;
}
function stage(rootElement,transition){
 if(!rootElement||!TRANSITIONS.has(transition))return null;
 const doc=rootElement.ownerDocument;
 if(!doc||typeof doc.createElement!=='function')return null;
 const media=doc.defaultView;
 if(media&&typeof media.matchMedia==='function'&&media.matchMedia('(prefers-reduced-motion: reduce)').matches)return null;
 rootElement.querySelectorAll('.diary-stage-transition').forEach(n=>n.remove());
 const effect=doc.createElement('div');
 effect.className='diary-stage-transition diary-stage-transition--'+transition;
 effect.setAttribute('aria-hidden','true');
 effect.setAttribute('role','presentation');
 rootElement.appendChild(effect);
 effect.addEventListener('animationend',()=>effect.remove(),{once:true});
 // Never append action names, narration, or directions to the DOM.
 return effect;
}
function validate(){
 if(DIRECTIONS.length!==36)throw Error('INVALID_EPISODE_COUNT');
 const distinct=new Set();
 for(const [i,e] of DIRECTIONS.entries()){
  if(e.episode!==i+1||!MUSIC.has(e.music)||!MUSIC.has(e.journalMusic)||!TRANSITIONS.has(e.transition)||e.sfx&&!SFX.has(e.sfx)||
   ![null,'classroom','workroom'].includes(e.ambience)||typeof e.action!=='string'||!/^[a-z0-9_]+$/.test(e.action)||distinct.has(e.action))throw Error('INVALID_DIRECTION_'+(i+1));
  distinct.add(e.action);
 }
 return {episodes:36,directions:36,silentSubtitleActions:true};
}
validate();
const api=Object.freeze({VERSION,DIRECTIONS,forEpisode,stage,validate});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiarySceneDirection=api;
})(typeof window!=='undefined'?window:globalThis);
