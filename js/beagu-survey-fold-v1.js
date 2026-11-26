/* Keep survey interpretation available without expanding every card. */
(()=>{
 'use strict';
 const selector='.beagu-survey-limit';
 function disclosure(p){
   if(p.dataset.beaguFolded||p.closest('details'))return;
   const value=p.textContent.trim(),match=value.match(/^(.+?[.!?])(?:\s+)([\s\S]+)$/);
   if(!match)return;
   const details=document.createElement('details');details.className='beagu-survey-fold';
   const summary=document.createElement('summary');summary.textContent=match[1];
   const tail=p.cloneNode(false);tail.textContent=match[2];tail.dataset.beaguFolded='true';
   details.append(summary,tail);p.replaceWith(details);
 }
 function scan(){document.querySelectorAll(selector).forEach(disclosure);}
 const purpose=document.querySelector('.beagu-survey-purpose');
 if(purpose){const paragraphs=[...purpose.querySelectorAll(':scope > p')];if(paragraphs.length>1){
   const details=document.createElement('details');details.className='beagu-survey-fold';
   const summary=document.createElement('summary');summary.textContent=paragraphs[0].textContent;details.append(summary);
   paragraphs[0].replaceWith(details);paragraphs.slice(1).forEach(p=>details.append(p));
 }}
 scan();new MutationObserver(records=>{for(const record of records){for(const node of record.addedNodes){if(node.nodeType!==1)continue;if(node.matches(selector))disclosure(node);node.querySelectorAll(selector).forEach(disclosure);}}}).observe(document.body,{subtree:true,childList:true});
})();
