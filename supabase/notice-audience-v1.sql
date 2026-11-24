-- Additive isolated notice storage. Existing notices and survey data remain untouched.
create table if not exists public.beagu_notice_audience_v1 (
 audience text primary key check (audience in ('all','0','1','2')),
 body text not null default '' check (char_length(body)<=1000),
 published boolean not null default false,
 revision integer not null default 1 check (revision>0),
 updated_at timestamptz not null default now(),
 updated_by uuid,
 check (not published or char_length(btrim(body)) between 1 and 1000)
);
alter table public.beagu_notice_audience_v1 enable row level security;
revoke all on table public.beagu_notice_audience_v1 from public, anon, authenticated;
grant select, update on table public.beagu_notice_audience_v1 to service_role;
insert into public.beagu_notice_audience_v1(audience,body,published)
select 'all',case when body='[BEAGU_NOTICE_HIDDEN_V1]' then '' when revision=1 and body='2026년 배구지수 데이터 작업 중입니다. 학교별 결과를 정리하고 있어 일부 정보는 아직 반영되지 않았을 수 있습니다.' then E'2026 조사데이터 업로드 시작.\n레벨2부터 확인 가능합니다. 추후 표본 수가 많아질 경우 레벨1에서도 확인하실 수 있습니다. 레벨이 높을수록 최신 자료와 더 많은 정보를 더 빠르게 확인할 수 있습니다.' else body end,body<>'[BEAGU_NOTICE_HIDDEN_V1]' from public.beagu_home_notice_v1 where id=1
on conflict(audience) do nothing;
insert into public.beagu_notice_audience_v1(audience) values ('0'),('1'),('2') on conflict(audience) do nothing;
