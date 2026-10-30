-- Additive schema. Existing school records, source rows and approvals are preserved.
create schema if not exists beagu_master;
revoke all on schema beagu_master from public,anon,authenticated;
grant usage on schema beagu_master to service_role;
create table beagu_master.source_batches (
 id uuid primary key default gen_random_uuid(), source_uri text not null,
 survey_year smallint not null check(survey_year between 2023 and 2026),
 schema_version text not null, content_sha256 text not null unique,
 imported_at timestamptz not null default now(), raw_payload jsonb not null,
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','NEEDS_REVIEW'))
);
create table beagu_master.school_records (
 batch_id uuid not null references beagu_master.source_batches(id), source_key text not null,
 school_id text references public.schools(school_id), survey_year smallint not null,
 match_status text not null check(match_status in ('MATCHED','NEEDS_REVIEW')),
 "values" jsonb not null, primary key(batch_id,source_key)
);
create index on beagu_master.school_records(school_id,survey_year);
alter table beagu_master.source_batches enable row level security;
alter table beagu_master.school_records enable row level security;
grant select,insert,update on all tables in schema beagu_master to service_role;
create view beagu_master.school_year_master with (security_invoker=true) as
 select s.school_id,y.survey_year,s.school_name,s.sido_standard,s.support_office,s.address,s.status,
   coalesce(d.historical_releases,'[]'::jsonb) historical_releases,
   coalesce(r.source_records,'[]'::jsonb) source_records
 from public.schools s cross join (values(2023),(2024),(2025),(2026)) y(survey_year)
 left join lateral (
   select jsonb_agg(to_jsonb(ld) order by ld.access_level) historical_releases
   from public.beagu_level_data ld where ld.school_id=s.school_id and ld.survey_year=y.survey_year
 ) d on true
 left join lateral (
   select jsonb_agg(to_jsonb(sr) order by sr.batch_id,sr.source_key) source_records
   from beagu_master.school_records sr where sr.school_id=s.school_id and sr.survey_year=y.survey_year
 ) r on true;
revoke all on beagu_master.school_year_master from public,anon,authenticated;
grant select on beagu_master.school_year_master to service_role;

create table public.beagu_metric_catalog (
 survey_year smallint not null, question_id text not null,
 label text not null, meaning text not null default '', interpretation text not null default '',
 direction text not null default '', unit text not null default '', spatial_scope text not null default '',
 source_ref text not null, options jsonb not null default '[]', scoring jsonb not null default '{}',
 value_type text not null default 'number' check(value_type='number'),
 minimum numeric not null default 0, maximum numeric not null default 100,
 access_level smallint not null check(access_level in (1,2)), verified boolean not null default false,
 verification_evidence text, primary key(survey_year,question_id),
 check(minimum<=maximum),
 check(not verified or length(verification_evidence)>0),
 check(access_level=case when survey_year=2026 and (question_id='percentile' or question_id ~ '^Q(0[1-9]|1[0-3])$') then 1 else 2 end)
);
alter table public.beagu_metric_catalog enable row level security;
revoke all on public.beagu_metric_catalog from public,anon,authenticated;
grant all on public.beagu_metric_catalog to service_role;
-- Keep one-observation records as review candidates; approval and privacy gates still apply.
alter table public.beagu_release_metrics_v2 drop constraint beagu_release_metrics_v2_n_valid_check;
alter table public.beagu_release_metrics_v2 add constraint beagu_release_metrics_v2_n_valid_check check(n_valid>=1);
alter table public.beagu_release_metrics_v2 add constraint beagu_release_metrics_catalog_fk foreign key(survey_year,question_id) references public.beagu_metric_catalog(survey_year,question_id);
alter table public.beagu_release_metrics_v2 add constraint beagu_release_metrics_level_policy check(access_level=case when survey_year=2026 and (question_id='percentile' or question_id ~ '^Q(0[1-9]|1[0-3])$') then 1 else 2 end);
-- Existing other constraints (including privacy approval) remain in force.

create table public.beagu_login_budget (
 bucket timestamptz primary key, attempts integer not null check(attempts>0)
);
alter table public.beagu_login_budget enable row level security;
revoke all on public.beagu_login_budget from public,anon,authenticated;
grant all on public.beagu_login_budget to service_role;
create function public.beagu_consume_login_budget() returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 delete from public.beagu_login_budget where bucket < now()-interval '1 hour';
 insert into public.beagu_login_budget(bucket,attempts) values(date_trunc('minute',now()),1)
 on conflict(bucket) do update set attempts=public.beagu_login_budget.attempts+1 returning attempts into n;
 return n<=60;
end $$;
revoke all on function public.beagu_consume_login_budget() from public,anon,authenticated;
grant execute on function public.beagu_consume_login_budget() to service_role;

create function public.beagu_import_master_batch(p_source text,p_year smallint,p_version text,p_hash text,p_raw jsonb,p_records jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare batch uuid;
begin
 if p_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_records)<>'array' then raise exception 'INVALID_BATCH';end if;
 insert into beagu_master.source_batches(source_uri,survey_year,schema_version,content_sha256,raw_payload)
 values(p_source,p_year,p_version,p_hash,p_raw) on conflict(content_sha256) do nothing returning id into batch;
 if batch is null then select id into batch from beagu_master.source_batches where content_sha256=p_hash;return batch;end if;
 insert into beagu_master.school_records(batch_id,source_key,school_id,survey_year,match_status,"values")
 select batch,x->>'source_key',x->>'school_id',p_year,x->>'match_status',x->'values' from jsonb_array_elements(p_records) x;
 return batch;
end $$;
revoke all on function public.beagu_import_master_batch(text,smallint,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.beagu_import_master_batch(text,smallint,text,text,jsonb,jsonb) to service_role;

-- Verified wording; aggregation approval remains pending.
insert into public.beagu_metric_catalog(survey_year,question_id,label,meaning,interpretation,direction,unit,spatial_scope,source_ref,options,scoring,value_type,minimum,maximum,access_level,verified,verification_evidence) values(2026,'Q01','교직원 친목·체육·회식에 참여하지 않겠다는 선택이 자연스럽게 받아들여진다.','교직원 친목·체육·회식에 참여하지 않겠다는 선택이 자연스럽게 받아들여진다.','높은 환산값은 더 높은 자율성·공정성·보호가능성을 뜻합니다. 학교 전체 의견을 대표하지 않을 수 있습니다.','정방향','점','해당 학교','2026 수정5 VI13 v1.2; Forms 원문 대조 2026-10-30','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]','{"① 전혀 그렇지 않다":0,"② 그렇지 않다":25,"③ 보통이다":50,"④ 그렇다":75,"⑤ 매우 그렇다":100,"⑥ 판단하기 어렵다":null}','number',0,100,1,false,null);
insert into public.beagu_metric_catalog(survey_year,question_id,label,meaning,interpretation,direction,unit,spatial_scope,source_ref,options,scoring,value_type,minimum,maximum,access_level,verified,verification_evidence) values(2026,'Q02','연가·조퇴를 사용할 때 관리자에게 직접 찾아가 보고해야 한다.','연가·조퇴를 사용할 때 관리자에게 직접 찾아가 보고해야 한다.','높은 환산값은 더 높은 자율성·공정성·보호가능성을 뜻합니다. 학교 전체 의견을 대표하지 않을 수 있습니다.','역방향','점','해당 학교','2026 수정5 VI13 v1.2; Forms 원문 대조 2026-10-30','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]','{"① 전혀 그렇지 않다":100,"② 그렇지 않다":75,"③ 보통이다":50,"④ 그렇다":25,"⑤ 매우 그렇다":0,"⑥ 판단하기 어렵다":null}','number',0,100,1,false,null);
insert into public.beagu_metric_catalog(survey_year,question_id,label,meaning,interpretation,direction,unit,spatial_scope,source_ref,options,scoring,value_type,minimum,maximum,access_level,verified,verification_evidence) values(2026,'Q03','병가 사용 시 정해진 복무 절차 외의 허락을 받거나 사용 자제를 요구받는다.','병가 사용 시 정해진 복무 절차 외의 허락을 받거나 사용 자제를 요구받는다.','높은 환산값은 더 높은 자율성·공정성·보호가능성을 뜻합니다. 학교 전체 의견을 대표하지 않을 수 있습니다.','역방향','점','해당 학교','2026 수정5 VI13 v1.2; Forms 원문 대조 2026-10-30','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]','{"① 전혀 그렇지 않다":100,"② 그렇지 않다":75,"③ 보통이다":50,"④ 그렇다":25,"⑤ 매우 그렇다":0,"⑥ 판단하기 어렵다":null}','number',0,100,1,false,null);
insert into public.beagu_metric_catalog(survey_year,question_id,label,meaning,interpretation,direction,unit,spatial_scope,source_ref,options,scoring,value_type,minimum,maximum,access_level,verified,verification_evidence) values(2026,'Q04','관리자나 다수와 다른 의견을 말하면 불이익이나 관계상의 압박이 걱정된다.','관리자나 다수와 다른 의견을 말하면 불이익이나 관계상의 압박이 걱정된다.','높은 환산값은 더 높은 자율성·공정성·보호가능성을 뜻합니다. 학교 전체 의견을 대표하지 않을 수 있습니다.','역방향','점','해당 학교','2026 수정5 VI13 v1.2; Forms 원문 대조 2026-10-30','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]','{"① 전혀 그렇지 않다":100,"② 그렇지 않다":75,"③ 보통이다":50,"④ 그렇다":25,"⑤ 매우 그렇다":0,"⑥ 판단하기 어렵다":null}','number',0,100,1,false,null);
insert into public.beagu_metric_catalog(survey_year,question_id,label,meaning,interpretation,direction,unit,spatial_scope,source_ref,options,scoring,value_type,minimum,maximum,access_level,verified,verification_evidence) values(2026,'Q05','수업·평가·학급 운영에서 전문적 판단보다 기존 관행을 따르도록 요구받는다.','수업·평가·학급 운영에서 전문적 판단보다 기존 관행을 따르도록 요구받는다.','높은 환산값은 더 높은 자율성·공정성·보호가능성을 뜻합니다. 학교 전체 의견을 대표하지 않을 수 있습니다.','역방향','점','해당 학교','2026 수정5 VI13 v1.2; Forms 원문 대조 2026-10-30','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]','{"① 전혀 그렇지 않다":100,"② 그렇지 않다":75,"③ 보통이다":50,"④ 그렇다":25,"⑤ 매우 그렇다":0,"⑥ 판단하기 어렵다":null}','number',0,100,1,false,null);
insert into public.beagu_metric_catalog(survey_year,question_id,label,meaning,interpretation,direction,unit,spatial_scope,source_ref,options,scoring,value_type,minimum,maximum,access_level,verified,verification_evidence) values(2026,'Q06','업무·보직 배정 기준이 구성원에게 공유되어 있다.','업무·보직 배정 기준이 구성원에게 공유되어 있다.','높은 환산값은 더 높은 자율성·공정성·보호가능성을 뜻합니다. 학교 전체 의견을 대표하지 않을 수 있습니다.','정방향','점','해당 학교','2026 수정5 VI13 v1.2; Forms 원문 대조 2026-10-30','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]','{"① 전혀 그렇지 않다":0,"② 그렇지 않다":25,"③ 보통이다":50,"④ 그렇다":75,"⑤ 매우 그렇다":100,"⑥ 판단하기 어렵다":null}','number',0,100,1,false,null);
insert into public.beagu_metric_catalog(survey_year,question_id,label,meaning,interpretation,direction,unit,spatial_scope,source_ref,options,scoring,value_type,minimum,maximum,access_level,verified,verification_evidence) values(2026,'Q07','업무·보직 배정 기준이 사람에 따라 달라지지 않고 일관되게 적용된다.','업무·보직 배정 기준이 사람에 따라 달라지지 않고 일관되게 적용된다.','높은 환산값은 더 높은 자율성·공정성·보호가능성을 뜻합니다. 학교 전체 의견을 대표하지 않을 수 있습니다.','정방향','점','해당 학교','2026 수정5 VI13 v1.2; Forms 원문 대조 2026-10-30','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]','{"① 전혀 그렇지 않다":0,"② 그렇지 않다":25,"③ 보통이다":50,"④ 그렇다":75,"⑤ 매우 그렇다":100,"⑥ 판단하기 어렵다":null}','number',0,100,1,false,null);
insert into public.beagu_metric_catalog(survey_year,question_id,label,meaning,interpretation,direction,unit,spatial_scope,source_ref,options,scoring,value_type,minimum,maximum,access_level,verified,verification_evidence) values(2026,'Q08','신규·전입·저연차라는 이유만으로 특정 업무(학년·교과 교육과정 계획 포함)를 우선 맡긴다.','신규·전입·저연차라는 이유만으로 특정 업무(학년·교과 교육과정 계획 포함)를 우선 맡긴다.','높은 환산값은 더 높은 자율성·공정성·보호가능성을 뜻합니다. 학교 전체 의견을 대표하지 않을 수 있습니다.','역방향','점','해당 학교','2026 수정5 VI13 v1.2; Forms 원문 대조 2026-10-30','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]','{"① 전혀 그렇지 않다":100,"② 그렇지 않다":75,"③ 보통이다":50,"④ 그렇다":25,"⑤ 매우 그렇다":0,"⑥ 판단하기 어렵다":null}','number',0,100,1,false,null);
insert into public.beagu_metric_catalog(survey_year,question_id,label,meaning,interpretation,direction,unit,spatial_scope,source_ref,options,scoring,value_type,minimum,maximum,access_level,verified,verification_evidence) values(2026,'Q09','업무 배정이나 학교 운영 결정에 이의를 제기하면 조정·재검토를 받을 수 있다.','업무 배정이나 학교 운영 결정에 이의를 제기하면 조정·재검토를 받을 수 있다.','높은 환산값은 더 높은 자율성·공정성·보호가능성을 뜻합니다. 학교 전체 의견을 대표하지 않을 수 있습니다.','정방향','점','해당 학교','2026 수정5 VI13 v1.2; Forms 원문 대조 2026-10-30','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]','{"① 전혀 그렇지 않다":0,"② 그렇지 않다":25,"③ 보통이다":50,"④ 그렇다":75,"⑤ 매우 그렇다":100,"⑥ 판단하기 어렵다":null}','number',0,100,1,false,null);
insert into public.beagu_metric_catalog(survey_year,question_id,label,meaning,interpretation,direction,unit,spatial_scope,source_ref,options,scoring,value_type,minimum,maximum,access_level,verified,verification_evidence) values(2026,'Q10','심각한 학부모 민원·갈등이 생기면 관리자 등 학교 차원에서 함께 대응한다.','심각한 학부모 민원·갈등이 생기면 관리자 등 학교 차원에서 함께 대응한다.','높은 환산값은 더 높은 자율성·공정성·보호가능성을 뜻합니다. 학교 전체 의견을 대표하지 않을 수 있습니다.','정방향','점','해당 학교','2026 수정5 VI13 v1.2; Forms 원문 대조 2026-10-30','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]','{"① 전혀 그렇지 않다":0,"② 그렇지 않다":25,"③ 보통이다":50,"④ 그렇다":75,"⑤ 매우 그렇다":100,"⑥ 판단하기 어렵다":null}','number',0,100,1,false,null);
insert into public.beagu_metric_catalog(survey_year,question_id,label,meaning,interpretation,direction,unit,spatial_scope,source_ref,options,scoring,value_type,minimum,maximum,access_level,verified,verification_evidence) values(2026,'Q11','교사 혼자 감당하기 어려운 학생지도 문제가 생기면 관리자 등이 함께 대응한다.','교사 혼자 감당하기 어려운 학생지도 문제가 생기면 관리자 등이 함께 대응한다.','높은 환산값은 더 높은 자율성·공정성·보호가능성을 뜻합니다. 학교 전체 의견을 대표하지 않을 수 있습니다.','정방향','점','해당 학교','2026 수정5 VI13 v1.2; Forms 원문 대조 2026-10-30','["① 전혀 그렇지 않다","② 그렇지 않다","③ 보통이다","④ 그렇다","⑤ 매우 그렇다","⑥ 판단하기 어렵다"]','{"① 전혀 그렇지 않다":0,"② 그렇지 않다":25,"③ 보통이다":50,"④ 그렇다":75,"⑤ 매우 그렇다":100,"⑥ 판단하기 어렵다":null}','number',0,100,1,false,null);
insert into public.beagu_metric_catalog(survey_year,question_id,label,meaning,interpretation,direction,unit,spatial_scope,source_ref,options,scoring,value_type,minimum,maximum,access_level,verified,verification_evidence) values(2026,'Q12','방학 중 교사 근무조·당번을 어떻게 운영합니까?','방학 중 교사 근무조·당번을 어떻게 운영합니까?','높은 환산값은 더 높은 자율성·공정성·보호가능성을 뜻합니다. 학교 전체 의견을 대표하지 않을 수 있습니다.','범주형 환산','점','해당 학교','2026 수정5 VI13 v1.2; Forms 원문 대조 2026-10-30','["① 운영하지 않는다","② 희망자만 참여한다","③ 희망과 관계없이 배정하지만 조정할 수 있다","④ 희망과 관계없이 배정하고 조정하기 어렵다","⑤ 잘 모르겠다"]','{"① 운영하지 않는다":100,"② 희망자만 참여한다":100,"③ 희망과 관계없이 배정하지만 조정할 수 있다":50,"④ 희망과 관계없이 배정하고 조정하기 어렵다":0,"⑤ 잘 모르겠다":null}','number',0,100,1,false,null);
insert into public.beagu_metric_catalog(survey_year,question_id,label,meaning,interpretation,direction,unit,spatial_scope,source_ref,options,scoring,value_type,minimum,maximum,access_level,verified,verification_evidence) values(2026,'Q13','성별·나이를 이유로 비공식 업무를 맡기는 일이 있습니까?','성별·나이를 이유로 비공식 업무를 맡기는 일이 있습니까?','높은 환산값은 더 높은 자율성·공정성·보호가능성을 뜻합니다. 학교 전체 의견을 대표하지 않을 수 있습니다.','범주형 환산','점','해당 학교','2026 수정5 VI13 v1.2; Forms 원문 대조 2026-10-30','["① 그런 일이 없다","② 요청은 있지만 자유롭게 거절할 수 있다","③ 거절하면 눈치나 부담을 준다","④ 사실상 거절하기 어렵다","⑤ 판단하기 어렵다"]','{"① 그런 일이 없다":100,"② 요청은 있지만 자유롭게 거절할 수 있다":100,"③ 거절하면 눈치나 부담을 준다":25,"④ 사실상 거절하기 어렵다":0,"⑤ 판단하기 어렵다":null}','number',0,100,1,false,null);
