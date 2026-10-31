/* Public Lv.0 only. Generated 2026-10-27. No authentication or protected data. */
(function(root){
  'use strict';
  const valid = v => typeof v==='number' && Number.isFinite(v) && v>=0 && v<=100;
  const allowed = new Set(['VERIFIED_LEGACY_RESTORATION','EXISTING_PUBLIC_VALUE_PRESERVED','NO_PUBLISHED_VALUE','REVIEW_PENDING']);
  function buildIndex(data){
    if(!['public-lv0-20261027-v1.2','public-lv0-20261031-v1.3-empirical-2025'].includes(data?.data_version) || data.publication_status!=='LV0_EXISTING_PUBLIC_SCOPE' || !Array.isArray(data.rows)) throw new Error('Unsupported public data');
    const index=new Map();
    for(const row of data.rows){
      if(typeof row.school_id!=='string' || !/^\d{7}$/.test(row.school_id) || index.has(row.school_id)) throw new Error('Invalid school identity');
      if(!Array.isArray(row.percentiles) || row.percentiles.length!==3 || !Array.isArray(row.statuses) || row.statuses.length!==3) throw new Error('Invalid years');
      row.percentiles.forEach((v,i)=>{
        if(!allowed.has(row.statuses[i]) || (v!==null && !valid(v))) throw new Error('Invalid percentile');
        const approved=['VERIFIED_LEGACY_RESTORATION','EXISTING_PUBLIC_VALUE_PRESERVED'].includes(row.statuses[i]);
        if(approved !== (v!==null)) throw new Error('Invalid release state');
      });
      index.set(row.school_id,row);
    }
    return index;
  }
  function values(row){return [0,1,2].map(i=>valid(row?.percentiles?.[i])?row.percentiles[i]:null);}
  root.BeaguPublic=Object.freeze({buildIndex,values});
})(globalThis);
