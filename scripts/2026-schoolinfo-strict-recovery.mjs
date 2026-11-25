// Schoolinfo 2026 identity recovery. Public school metadata only; never accepts survey rows.
const norm = x => String(x ?? '').normalize('NFKC').replace(/\s/g, '');
const prefixes = /전남광주통합특별시|서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전북특별자치도|전라북도|전라남도|경상북도|경상남도|제주특별자치도/g;
const regions = ['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주'];
export function normalizeDisclosureRegion(educationOffice) {
 const a=norm(educationOffice);
 if(a==='전남광주통합특별시교육청(광주)')return '광주';
 if(a==='전남광주통합특별시교육청(전남)')return '전남';
 if(a.startsWith('전남광주통합특별시'))return '';
 return regions.find(k=>a.startsWith(k))??'';
}
export function normalizeDisclosureOffice(value) {
 return norm(value).replace(prefixes,'').replace(/교육지원청|교육청/g,'').replace(/^광주(동부|서부)$/,'$1');
}
export function normalizeDisclosureAddress(value) {
 return norm(value).replace(/^(전남광주통합특별시|광주광역시|전라남도|전남|광주|서울특별시|부산광역시|대구광역시|인천광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전북특별자치도|전라북도|경상북도|경상남도|제주특별자치도)/,'').replace(/\(.*\)$/,'');
}
export function strictOfficialProfileMatch(s, rows) {
 const candidates=rows.filter(p=>p.closed==='N'&&p.suspended==='N'&&/^S[0-9]{9}$/.test(String(p.disclosure_code))&&
 norm(p.school_name)&&norm(p.school_name)===norm(s.school_name)&&normalizeDisclosureRegion(p.education_office)===s.sido_standard&&
 norm(p.establishment)&&norm(p.establishment)===norm(s.establishment)&&
 normalizeDisclosureOffice(p.support_office)&&normalizeDisclosureOffice(p.support_office)===normalizeDisclosureOffice(s.support_office)&&
 normalizeDisclosureAddress(p.road_address)&&normalizeDisclosureAddress(p.road_address)===normalizeDisclosureAddress(s.address));
 return candidates.length===1?candidates[0]:null;
}
