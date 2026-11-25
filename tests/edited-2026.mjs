import assert from 'node:assert/strict';
import {edited2026Rows} from '../supabase/functions/_shared/edited-2026.mjs';
const rows=edited2026Rows([['학교ID','백분위','Q01','Q22.1','Q31','Q51'],['1000001','82.34%','보통이다','그렇다','SECRET','SECRET']]);
assert.deepEqual(rows,[{school_id:'1000001',percentile:82.34,questions:[{questionId:'Q01',row:-1,values:['보통이다']},{questionId:'Q22',row:0,values:['그렇다']}]}]);
for(const t of [[['학교ID','백분위'],['1000001','101']],[['학교ID','백분위','개인정보'],['1000001','5','secret']],[['학교ID','백분위','Q01'],['1000001','5','unknown']],[['학교ID','백분위'],['1000001','5'],['1000001','9']]])assert.throws(()=>edited2026Rows(t));
console.log('PASS direct supplied values, grid, exact catalog, protected columns discarded, invalid values rejected');
