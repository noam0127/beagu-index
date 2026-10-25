(() => {
 const status=document.getElementById('status'),capture=document.getElementById('capture');
 const home=new URL('index.html',location.href).href;
 let imageFile=null, imageUrl=null;
 async function join() {
   try {
     if(!window.beaguVisitor) throw new Error('브라우저 저장 공간을 허용한 뒤 다시 접속해 주세요.');
     const {data,error}=await supabaseClient.rpc('beagu_join_challenge',{p_visitor:window.beaguVisitor});
     if(error || !Number.isSafeInteger(Number(data)) || Number(data)<1) throw new Error('참여 기록 연결을 확인하지 못했습니다. 잠시 후 다시 접속해 주세요.');
     document.getElementById('participantNo').textContent=Number(data).toLocaleString('ko-KR')+'번째';
     capture.disabled=false; status.textContent='인증 버튼을 누르면 위 참여 카드가 이미지로 만들어집니다.';
   } catch(e) {document.getElementById('participantNo').textContent='순번 확인 대기';status.textContent=e.message;}
 }
 capture.addEventListener('click',async()=>{
   capture.disabled=true;
   try {
     if(typeof html2canvas!=='function') throw new Error('이미지 기능을 불러오지 못했습니다. 화면을 직접 캡처해 주세요.');
     await document.fonts.ready;
     const canvas=await html2canvas(document.getElementById('certificate'),{scale:2,backgroundColor:'#ffffff',logging:false});
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
     if(!blob) throw new Error('이미지를 생성하지 못했습니다. 다시 시도해 주세요.');
     imageFile=new File([blob],'2026-배구지수-챌린지.png',{type:'image/png'});
     if(imageUrl) URL.revokeObjectURL(imageUrl);
     imageUrl=URL.createObjectURL(blob);
     document.getElementById('download').href=imageUrl;document.getElementById('preview').src=imageUrl;
     document.getElementById('shareActions').hidden=false;
     document.getElementById('share').hidden=!(navigator.share&&navigator.canShare?.({files:[imageFile]}));
     status.textContent='이미지가 준비되었습니다. 저장하거나 공유한 뒤 쫑알쫑알에 첨부해 주세요.';
   }catch(e){status.textContent=e.message;}finally{capture.disabled=false;}
 });
 document.getElementById('share').addEventListener('click',async()=>{
   try{await navigator.share({files:[imageFile],title:'2026 배구지수 챌린지',text:'선생님의 경험이 다른 선생님의 선택을 돕습니다.\n'+home});}
   catch(e){if(e.name!=='AbortError')status.textContent='공유가 지원되지 않으면 이미지 저장과 링크 복사를 이용해 주세요.';}
 });
 document.getElementById('copy').addEventListener('click',async()=>{
   try{await navigator.clipboard.writeText(home);status.textContent='배구지수 챌린지 대문 링크를 복사했습니다.';}
   catch(_){status.textContent='아래 주소를 길게 눌러 복사해 주세요: '+home;}
 });
 join();
})();
