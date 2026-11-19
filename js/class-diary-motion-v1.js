/* Motion layer for Class Diary. Visual-only, no persistence or network calls. */
(function(root){
'use strict';
function init(){
 const doc=root.document;
 const stage=doc.getElementById('sceneArt');
 const backdrop=doc.getElementById('sceneBackdrop');
 const portrait=doc.getElementById('scenePortrait');
 const day=doc.getElementById('chapterDay');
 const setup=doc.getElementById('setup');
 if(!stage||!backdrop||!portrait||!day||!setup||!root.MutationObserver)return;
 const reduced=typeof root.matchMedia==='function'
   ?root.matchMedia('(prefers-reduced-motion: reduce)')
   :{matches:false};
 const moving=()=>!reduced.matches && doc.body.classList.contains('is-playing');
 let previousBg='',previousPortrait='',hasStage=false,ghost=null,ghostTimer=0;
 function clearGhost(){
   root.clearTimeout(ghostTimer);
   if(ghost){ghost.remove();ghost=null;}
 }
 function makeGhost(beforeBg,beforePortrait,includeBg){
   clearGhost();
   if(!moving())return;
   const layer=doc.createElement('div');
   layer.className='diary-motion-ghost';
   layer.setAttribute('aria-hidden','true');
   if(includeBg&&beforeBg){
     const oldBg=doc.createElement('div');
     oldBg.className='diary-motion-ghost-backdrop';
     oldBg.style.backgroundImage=beforeBg;
     layer.append(oldBg);
   }
   if(beforePortrait){
     const oldActor=doc.createElement('img');
     oldActor.className='diary-motion-ghost-portrait';
     oldActor.alt='';
     oldActor.setAttribute('aria-hidden','true');
     oldActor.src=beforePortrait;
     const style=root.getComputedStyle(portrait);
     for(const key of ['height','width','maxWidth','right','bottom','objectFit','objectPosition','filter']){
       oldActor.style[key]=style[key];
     }
     layer.append(oldActor);
   }
   if(!layer.childNodes.length)return;
   stage.append(layer);
   ghost=layer;
   layer.addEventListener('animationend',()=>{if(ghost===layer)clearGhost();else layer.remove();},{once:true});
   ghostTimer=root.setTimeout(()=>{if(ghost===layer)clearGhost();},650);
 }
 function stageChanged(){
   const nextBg=backdrop.style.backgroundImage||'';
   const nextPortrait=portrait.getAttribute('src')||'';
   if(!nextBg||!nextPortrait)return;
   if(hasStage&&(previousBg!==nextBg||previousPortrait!==nextPortrait)){
     makeGhost(previousBg,previousPortrait,previousBg!==nextBg);
   }
   previousBg=nextBg;previousPortrait=nextPortrait;hasStage=true;
 }
 const sceneObserver=new root.MutationObserver(stageChanged);
 sceneObserver.observe(backdrop,{attributes:true,attributeFilter:['style']});
 sceneObserver.observe(portrait,{attributes:true,attributeFilter:['src']});

 function restartAnimation(node,animationClass){
   if(!node||reduced.matches)return;
   node.classList.remove(animationClass);
   void node.offsetWidth;
   node.classList.add(animationClass);
 }
 for(const id of ['chapterText','outcomeText']){
   const target=doc.getElementById(id);
   if(!target)continue;
   const observer=new root.MutationObserver(()=>restartAnimation(target,'diary-motion-copy'));
   observer.observe(target,{childList:true});
 }
 let previousDay='';
 function dayChanged(){
   const raw=(day.textContent||'').trim();
   const match=/^\d+\s*\/\s*(?:7|36)\b/.exec(raw);
   const key=match?match[0]:raw;
   if(!key||key===previousDay)return;
   previousDay=key;
   if(!moving())return;
   stage.querySelectorAll('.diary-motion-day').forEach(n=>n.remove());
   const card=doc.createElement('div');
   card.className='diary-motion-day';
   card.setAttribute('aria-hidden','true');
   const label=doc.createElement('span');
   label.textContent=raw;
   card.append(label);
   stage.append(card);
   card.addEventListener('animationend',()=>card.remove(),{once:true});
   root.setTimeout(()=>card.remove(),1150);
 }
 new root.MutationObserver(dayChanged).observe(day,{childList:true,subtree:true,characterData:true});

 const screens={1:setup.querySelector('[data-setup-screen="1"]'),
                2:setup.querySelector('[data-setup-screen="2"]'),
                3:setup.querySelector('[data-setup-screen="3"]')};
 let lastStep=setup.dataset.step;
 function stepChanged(){
   const step=setup.dataset.step;
   if(!step||step===lastStep)return;
   lastStep=step;
   restartAnimation(screens[step],'diary-motion-step');
 }
 new root.MutationObserver(stepChanged).observe(setup,{attributes:true,attributeFilter:['data-step']});

 const ending=doc.getElementById('ending');
 if(ending){
   new root.MutationObserver(()=>{
     if(!ending.hidden)restartAnimation(ending,'diary-motion-ending');
   }).observe(ending,{attributes:true,attributeFilter:['hidden']});
 }
 root.addEventListener('pagehide',clearGhost,{once:true});
}
if(typeof root.document!=='undefined'){
 if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
}
})(typeof window!=='undefined'?window:globalThis);
