import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@1";

const OFFICES = [
  { code: "B10", name: "서울특별시교육청", sidoStandard: "서울" },
  { code: "C10", name: "부산광역시교육청", sidoStandard: "부산" },
  { code: "D10", name: "대구광역시교육청", sidoStandard: "대구" },
  { code: "E10", name: "인천광역시교육청", sidoStandard: "인천" },
  { code: "F10", name: "전남광주통합특별시교육청(광주권역)", sidoStandard: "광주" },
  { code: "G10", name: "대전광역시교육청", sidoStandard: "대전" },
  { code: "H10", name: "울산광역시교육청", sidoStandard: "울산" },
  { code: "I10", name: "세종특별자치시교육청", sidoStandard: "세종" },
  { code: "J10", name: "경기도교육청", sidoStandard: "경기" },
  { code: "K10", name: "강원특별자치도교육청", sidoStandard: "강원" },
  { code: "M10", name: "충청북도교육청", sidoStandard: "충북" },
  { code: "N10", name: "충청남도교육청", sidoStandard: "충남" },
  { code: "P10", name: "전북특별자치도교육청", sidoStandard: "전북" },
  { code: "Q10", name: "전남광주통합특별시교육청(광주권역)", sidoStandard: "전남" },
  { code: "R10", name: "경상북도교육청", sidoStandard: "경북" },
  { code: "S10", name: "경상남도교육청", sidoStandard: "경남" },
  { code: "T10", name: "제주특별자치도교육청", sidoStandard: "제주" }
];
const PAGE_SIZE = 1000;

const changwonSurveyOffice = (region: string, address: unknown, officialOffice: unknown): string => {
  const source = String(officialOffice || '').trim();
  if(region !== '경남') return source;
  const road = String(address || '').normalize('NFKC').replace(/\s+/g, ' ');
  if(!road.includes('창원시')) return source;
  // These are survey areas under a single legally established education support office.
  if(/마산(합포구|회원구)/.test(road)) return '창원교육지원청(마산센터)';
  if(/진해구/.test(road)) return '창원교육지원청(진해센터)';
  if(/(의창구|성산구)/.test(road)) return '창원교육지원청';
  return source; // Unknown district: retain official source, never guess.
};


export default {
  fetch: withSupabase(
    { auth: "secret" },

    async (_req, ctx) => {
      try {
        const neisKey = Deno.env.get("NEIS_API_KEY");

        if (!neisKey) {
          return Response.json(
            {
              ok: false,
              message: "NEIS_API_KEY가 설정되지 않았습니다."
            },
            { status: 500 }
          );
        }

        const syncedAt = new Date().toISOString();

        let totalSaved = 0;
        const officeResults = [];

        for (const office of OFFICES) {

          let page = 1;
          let totalCount = 0;
          let receivedCount = 0;
          let savedCount = 0;

          while (true) {

            const url = new URL(
              "https://open.neis.go.kr/hub/schoolInfo"
            );

            url.searchParams.set("KEY", neisKey);
            url.searchParams.set("Type", "json");
            url.searchParams.set(
              "pIndex",
              String(page)
            );
            url.searchParams.set(
              "pSize",
              String(PAGE_SIZE)
            );

            url.searchParams.set(
              "ATPT_OFCDC_SC_CODE",
              office.code
            );

            url.searchParams.set(
              "SCHUL_KND_SC_NM",
              "초등학교"
            );

            const response = await fetch(url);

            if (!response.ok) {
              throw new Error(
                `${office.name} NEIS HTTP 오류: ${response.status}`
              );
            }

            const json = await response.json();

            if (json.RESULT) {
              throw new Error(
                `${office.name}: ${json.RESULT.CODE} ${json.RESULT.MESSAGE}`
              );
            }

            if (page === 1) {
              totalCount =
                json?.schoolInfo?.[0]?.head?.[0]
                  ?.list_total_count ?? 0;
            }

            const rows =
              json?.schoolInfo?.[1]?.row ?? [];

            if (rows.length === 0) {
              break;
            }

           const schoolMap = new Map<string, any>();

for (const school of rows) {

  const schoolId = String(school.SD_SCHUL_CODE || '').trim();
  // A blank or placeholder code must not re-enter the public operating schools table.
  if (!/^[A-Z0-9]{7}$/.test(schoolId)) {
    continue;
  }

  schoolMap.set(
    schoolId,
    {
      school_id:
        schoolId,

      school_code:
        schoolId,

      school_name:
        school.SCHUL_NM,

      sido:
        school.LCTN_SC_NM,

      sido_standard:
        office.sidoStandard,

      education_office_code:
        school.ATPT_OFCDC_SC_CODE,

      education_office:
        school.ATPT_OFCDC_SC_NM,

      support_office:
        changwonSurveyOffice(office.sidoStandard, school.ORG_RDNMA, school.JU_ORG_NM),

      school_kind:
        school.SCHUL_KND_SC_NM,

      establishment:
        school.FOND_SC_NM,

      address:
        school.ORG_RDNMA,

      homepage:
        school.HMPG_ADRES,

      status:
        "운영",

      source:
        "neis",

      updated_at:
        syncedAt,

      last_synced_at:
        syncedAt
    }
  );
}

const schools =
  Array.from(schoolMap.values());
            for (
              let i = 0;
              i < schools.length;
              i += 200
            ) {

              const chunk =
                schools.slice(i, i + 200);

              const { error } =
                await ctx.supabaseAdmin
                  .from("schools")
                  .upsert(
                    chunk,
                    {
                      onConflict: "school_id"
                    }
                  );

              if (error) {
                throw new Error(
                  `${office.name} 저장 오류: ${error.message}`
                );
              }

              savedCount += chunk.length;
            }

            receivedCount += rows.length;

            if (receivedCount >= totalCount) {
              break;
            }

            page += 1;
          }

          totalSaved += savedCount;

          officeResults.push({
            code: office.code,
            office: office.name,
            neis_total_count: totalCount,
            received_count: receivedCount,
            saved_count: savedCount
          });
        }

        return Response.json({
          ok: true,
          synced_at: syncedAt,
          total_saved_count: totalSaved,
          offices: officeResults
        });

      } catch (error) {

        console.error(error);

        return Response.json(
          {
            ok: false,
            message:
              error instanceof Error
                ? error.message
                : "알 수 없는 오류"
          },
          { status: 500 }
        );
      }
    }
  )
};