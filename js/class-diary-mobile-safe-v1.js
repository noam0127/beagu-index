/* Mobile Safari visible viewport guard for the Class Diary.
 * Presentation-only: no game state, account state or network activity.
 */
(function(root){
 'use strict';
 if(!root.document)return;
 const rootNode=root.document.documentElement;
 let scheduled=false;
 function apply(){
  scheduled=false;
  const vh=root.visualViewport;
  const visible=vh&&Number.isFinite(vh.height)?vh.height:root.innerHeight;
  const height=Math.floor(Math.max(280,Math.min(root.innerHeight||visible,visible)));
  if(Number.isFinite(height))rootNode.style.setProperty('--diary-visible-height',height+'px');
 }
 function refresh(){
  if(scheduled)return;
  scheduled=true;
  if(root.requestAnimationFrame)root.requestAnimationFrame(apply);
  else apply();
 }
 if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',refresh,{once:true});
 else refresh();
 root.addEventListener('resize',refresh,{passive:true});
 if(root.visualViewport){
  root.visualViewport.addEventListener('resize',refresh,{passive:true});
  root.visualViewport.addEventListener('scroll',refresh,{passive:true});
 }
})(typeof window!=='undefined'?window:globalThis);
