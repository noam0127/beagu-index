/* Public Lv.0 only. Generated 2026-10-27. No authentication or protected data. */
(function(root){
  'use strict';
  const valid = v => typeof v==='number' && Number.isFinite(v) && v>=0 && v<=100;
  const versions = new Set(['public-lv0-20261027-v1.2','public-lv0-20261031-v1.3-empirical-2025',
    'public-lv0-20261120-all-regions-verified-percentiles-v1.4']);
  const held = new Set(['NO_PUBLISHED_VALUE','REVIEW_PENDING']);
  function buildIndex(data){
    if(!versions.has(data?.data_version) || data.publication_status!=='LV0_EXISTING_PUBLIC_SCOPE' || !Array.isArray(data.rows)) throw new Error('Unsupported public data');
    const index=new Map();
    for(const row of data.rows){
      if(typeof row.school_id!=='string' || !/^[A-Z0-9]{7}$/.test(row.school_id) || index.has(row.school_id)) throw new Error('Invalid school identity');
      if(!Array.isArray(row.percentiles) || row.percentiles.length!==3 || !Array.isArray(row.statuses) || row.statuses.length!==3) throw new Error('Invalid years');
      row.percentiles.forEach((v,i)=>{
        const status=row.statuses[i];
        const approved=status==='VERIFIED_LEGACY_RESTORATION'||status==='EXISTING_PUBLIC_VALUE_PRESERVED'||
          (i===2&&status==='VETTED_2025_EMPIRICAL_PERCENTILE');
        if((!approved&&!held.has(status)) || (v!==null && !valid(v))) throw new Error('Invalid percentile');
        if(approved !== (v!==null)) throw new Error('Invalid release state');
      });
      index.set(row.school_id,row);
    }
    return index;
  }
  function values(row){return [0,1,2].map(i=>valid(row?.percentiles?.[i])?row.percentiles[i]:null);}
  root.BeaguPublic=Object.freeze({buildIndex,values});
})(globalThis);
