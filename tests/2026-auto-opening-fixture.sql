-- Synthetic-only prerequisites for civic reporting and automatic evidence.
alter table beagu_private.beagu_2026_level_release_approvals add column if not exists approved boolean not null default false;
create table beagu_private.beagu_2026_civic_feedback(
 id uuid primary key default gen_random_uuid(), school_id text references public.schools(school_id),kind text,category text,question_id text,detail text,actor_hash text,verified_visitor uuid,status text default 'PENDING',decision_reason text,decision_by uuid,created_at timestamptz default now(),updated_at timestamptz default now()
);
create table beagu_private.beagu_2026_civic_feedback_audit(id bigint generated always as identity primary key,feedback_id uuid,actor_id uuid,action text,reason text);
grant select,insert,update on beagu_private.beagu_2026_civic_feedback to service_role;
grant insert,select on beagu_private.beagu_2026_civic_feedback_audit to service_role;
insert into public.schools values('1000004','fixture automatic'),('1000005','fixture unverified'),('1000006','fixture private');
insert into public.beagu_school_report_yearly(school_id,survey_year,source_version,percentile,valid_observation_count,percentile_method,publication_status)
values('1000004',2026,'fixture-auto-version',40,1,'PERCENT_RANK_ASC_EXACT_MEAN_VI13_MIN9_A4_P2_R1','WITHHELD'),('1000005',2026,'fixture-auto-version',50,1,'PERCENT_RANK_ASC_EXACT_MEAN_VI13_MIN9_A4_P2_R1','WITHHELD');
insert into public.beagu_2026_official_school_profiles(school_id,disclosure_code,profile,teacher_total,source_sha256,mapping_rule)
values('1000004','S000000004','{"school_name":"fixture automatic"}',7,repeat('c',64),'EXACT'),('1000005','S000000005','{"school_name":"fixture unverified"}',20,repeat('d',64),'EXACT');

create table beagu_private.beagu_2026_auto_review_status(school_id text,source_spreadsheet_id text,survey_year int,technical_status text,source_response_rows int);grant select on beagu_private.beagu_2026_auto_review_status to service_role;
