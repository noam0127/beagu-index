/* Class Diary: measured reader offset and touch-to-advance.
 * Presentation only; never changes the story engine, choices, progress tokens,
 * school data or stored checkpoints. The original hidden turn buttons remain
 * available for the existing page progression/auto-play routines.
 */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const card=$('novelCard'),reader=$('vnBottom'),header=$('vnHeaderSlot'),
       hudActions=$('diaryHudActions'),stats=$('diaryHudStats'),stage=$('sceneArt');
 if(!card||!reader||!header||!stage)return;
 const turnButtons=[$('vnMore'),$('nextBtn')].filter(Boolean);
 turnButtons.forEach(button=>{
  button.setAttribute('aria-hidden','true');
  button.setAttribute('tabindex','-1');
 });
 // The prior next button was the only clickable target in some scenes.
 // Touching the prose must continue to invoke the same registered handlers.
 // #vnBottom is already inside #sceneArt. Its click bubbles to the
 // original scene handler, so forwarding stage.click() here would advance twice.
 // No extra reader click listener is needed.

 let pending=false;
 const shown=node=>node&&node.isConnected&&getComputedStyle(node).display!=='none'&&
   getComputedStyle(node).visibility!=='hidden';
 function update(){
  pending=false;
  if(!document.body.classList.contains('is-playing')||
     !document.body.classList.contains('diary-hud-open')){
   card.style.removeProperty('--diary-open-reader-top');
   return;
  }
  const cardBox=card.getBoundingClientRect();
  const edges=[header,hudActions,stats].filter(shown)
   .map(node=>node.getBoundingClientRect().bottom-cardBox.top);
  const minimum=cardBox.height<=540?107:148;
  const measured=Math.max(minimum,...edges.map(edge=>edge+12));
  // Keep an actual reading surface on very short viewports. Short landscape
  // header styles compress the chapter details before this limit applies.
  const maxTop=Math.max(minimum,cardBox.height-Math.min(195,Math.max(125,cardBox.height*.3)));
  const top=Math.min(measured,maxTop);
  card.style.setProperty('--diary-open-reader-top',Math.round(top)+'px');
 }
 function schedule(){
  if(pending)return;
  pending=true;
  requestAnimationFrame(update);
 }
 const classes=new MutationObserver(schedule);
 classes.observe(document.body,{attributes:true,attributeFilter:['class']});
 const content=new MutationObserver(schedule);
 content.observe(header,{childList:true,characterData:true,subtree:true});
 if(hudActions)content.observe(hudActions,{childList:true,attributes:true,subtree:true,attributeFilter:['hidden','class','style']});
 const statsObserver=new MutationObserver(schedule);
 if(stats)statsObserver.observe(stats,{childList:true,characterData:true,subtree:true});
 if(typeof ResizeObserver==='function'){
  const resizer=new ResizeObserver(schedule);
  resizer.observe(card);resizer.observe(header);
  if(hudActions)resizer.observe(hudActions);
 }
 window.addEventListener('resize',schedule,{passive:true});
 if(window.visualViewport)visualViewport.addEventListener('resize',schedule,{passive:true});
 schedule();
})();
