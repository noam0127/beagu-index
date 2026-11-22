/* Trust only the release service's persisted CI/CD job state.
 * No time-based percentages or success from queued/stale/mismatched SHA. */
(function(root){
  "use strict";
  function snapshot(current,last,releaseState){
    const job=current||last||null;
    if(!job)return {visible:false,state:"idle",text:"현재 배포 작업 없음",value:0,indeterminate:false,completed:false};
    const dest=job.target==="production"?"운영 웹":"시험 웹";
    const version=typeof job.version==="string"?job.version:"버전 미상";
    const suffix=" · "+dest+" · "+version;
    if(job.status==="queued")return {visible:true,state:"queued",text:"배포 대기"+suffix,value:0,indeterminate:false,completed:false};
    if(job.status==="running")return {visible:true,state:"running",text:"실제 배포 진행 중"+suffix,value:null,indeterminate:true,completed:false};
    if(job.status==="deployed"){
      // The most recent successful job can be stale after a rollback or
      // another release. Never display a completed bar for a different SHA.
      const currentSha=job.target==="production"?
        releaseState?.production_sha:releaseState?.staging_sha;
      const deployedSha=typeof job.to_sha==="string"?job.to_sha:"";
      if(!/^[a-f0-9]{40}$/.test(deployedSha)||currentSha!==deployedSha){
        return {visible:true,state:"superseded",
          text:"이후 버전 변경 또는 서버 상태 불일치"+suffix,
          value:0,indeterminate:false,completed:false};
      }
      return {visible:true,state:"deployed",text:"적용 완료"+suffix,
        value:100,indeterminate:false,completed:true};
    }
    if(job.status==="failed")return {visible:true,state:"failed",text:"배포 실패"+suffix+" · 관리자 확인 후 재요청",value:0,indeterminate:false,completed:false};
    return {visible:true,state:"unknown",text:"배포 상태 확인 필요"+suffix,value:0,indeterminate:false,completed:false};
  }
  root.BeaguReleaseProgress={snapshot};
})(typeof window!=="undefined"?window:globalThis);
