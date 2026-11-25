import assert from 'node:assert/strict';
import { normalizeDisclosureRegion,strictOfficialProfileMatch } from '../scripts/2026-schoolinfo-strict-recovery.mjs';
const s={school_name:'가상초등학교',sido_standard:'광주',support_office:'광주광역시동부교육지원청',establishment:'공립',address:'광주광역시 북구 가상로 1'};
const p={school_name:s.school_name,education_office:'전남광주통합특별시교육청(광주)',support_office:'전남광주통합특별시광주동부교육지원청',establishment:'공립',road_address:'전남광주통합특별시 북구 가상로 1',closed:'N',suspended:'N',disclosure_code:'S000000001'};
assert.equal(normalizeDisclosureRegion('전남광주통합특별시교육청(전남)'),'전남');
assert.equal(normalizeDisclosureRegion('전남광주통합특별시교육청'),'');
assert.equal(strictOfficialProfileMatch(s,[p]),p);
for(const patch of [{education_office:'전남광주통합특별시교육청(전남)'},{education_office:'전남광주통합특별시교육청'},{road_address:'전남광주통합특별시 북구 가상로 2'},{support_office:'광주서부교육지원청'},{establishment:'사립'},{closed:'Y'},{suspended:'Y'},{disclosure_code:'invalid'}]) assert.equal(strictOfficialProfileMatch(s,[{...p,...patch}]),null);
assert.equal(strictOfficialProfileMatch(s,[p,{...p,disclosure_code:'S000000002'}]),null);
console.log('strict Schoolinfo reconciliation fixture passed');

for(const [label,expected] of [['충청북도교육청','충북'],['충청남도교육청','충남'],['경상남도교육청','경남'],['경상북도교육청','경북']])assert.equal(normalizeDisclosureRegion(label),expected);
const cs={...s,sido_standard:'경남',support_office:'창원교육지원청(마산센터)',address:'경상남도 창원시 마산합포구 가상로 1'};
const cp={...p,education_office:'경상남도교육청',support_office:'창원교육지원청',road_address:cs.address};
assert.equal(strictOfficialProfileMatch(cs,[cp]),cp);
assert.equal(strictOfficialProfileMatch({...cs,support_office:'창원교육지원청(진해센터)'},[cp]),null);
assert.equal(strictOfficialProfileMatch(cs,[{...cp,road_address:'경상남도 창원시 마산합포구 가상로 2'}]),null);
