-- STRICTLY ISOLATED STAGING PROJECT ONLY. NEVER RUN AGAINST snvzwrexuqavnfvzgxqj.
-- All objects and fake data belong to a separate, empty Supabase test project.
do $$ begin
 if exists(select 1 from pg_catalog.pg_namespace where nspname='beagu_private')
    or current_setting('app.settings.beagu_production', true) = 'true' then
    raise exception 'PRODUCTION_FORBIDDEN';
 end if;
end $$;
create schema if not exists stage_private;
revoke all on schema stage_private from public, anon, authenticated;
grant usage on schema stage_private to service_role;

create table if not exists stage_private.members(
 auth_user_id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check(username ~ '^[a-z][a-z0-9_]{3,19}$'),
 level smallint not null default 0 check(level between 0 and 2),
 upgrade_unseen boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists stage_private.level1_proofs(
 token_sha text primary key check(token_sha ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create table if not exists stage_private.referrals(
 referrer uuid primary key references stage_private.members(auth_user_id) on delete cascade,
 token_sha text not null unique check(token_sha ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 revoked_at timestamptz
);
create table if not exists stage_private.submissions(
 respondent uuid primary key references stage_private.members(auth_user_id) on delete cascade,
 referrer uuid not null references stage_private.members(auth_user_id) on delete cascade,
 referral_sha text not null,
 created_at timestamptz not null default now(),
 constraint different_accounts check(respondent<>referrer)
);
create table if not exists stage_private.rate_limits(
 digest text primary key check(digest ~ '^[a-f0-9]{64}$'),
 started_at timestamptz not null default now(),
 attempts integer not null default 0
);
create table if not exists stage_private.fake_schools(
 id text primary key, name text not null, region text not null,
 survey_year int not null, score numeric(5,2) not null
);
insert into stage_private.fake_schools(id,name,region,survey_year,score) values
 ('TEST0001','가상별빛초등학교','부산',2026,73.2),
 ('TEST0002','가상새싹초등학교','강원',2026,61.5),
 ('TEST0003','가상바람초등학교','서울',2026,84.1)
on conflict (id) do nothing;

alter table stage_private.members enable row level security;
alter table stage_private.level1_proofs enable row level security;
alter table stage_private.referrals enable row level security;
alter table stage_private.submissions enable row level security;
alter table stage_private.rate_limits enable row level security;
alter table stage_private.fake_schools enable row level security;
revoke all on all tables in schema stage_private from public, anon, authenticated;
grant select,insert,update,delete on all tables in schema stage_private to service_role;

create or replace function public.beagu_stage_member(p_uid uuid)
returns jsonb language sql stable security invoker set search_path=''
as $$
 select jsonb_build_object('username',m.username,'level',m.level,
 'upgradeUnseen',m.upgrade_unseen) from stage_private.members m
 where m.auth_user_id=p_uid;
$$;
create or replace function public.beagu_stage_owner(p_username text)
returns uuid language sql stable security invoker set search_path=''
as $$
 select m.auth_user_id from stage_private.members m where m.username=p_username;
$$;
create or replace function public.beagu_stage_register(p_uid uuid,p_username text)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare rec stage_private.members%rowtype;
begin
 if p_uid is null or p_username !~ '^[a-z][a-z0-9_]{3,19}$' then
  raise exception 'INVALID_USERNAME' using errcode='22023';
 end if;
 insert into stage_private.members(auth_user_id,username) values(p_uid,p_username)
 on conflict(auth_user_id) do nothing;
 select * into rec from stage_private.members where auth_user_id=p_uid;
 if rec.username is distinct from p_username then
  raise exception 'ACCOUNT_ALREADY_REGISTERED' using errcode='23505';
 end if;
 return jsonb_build_object('username',rec.username,'level',rec.level);
end $$;
create or replace function public.beagu_stage_level1(p_uid uuid)
returns integer language plpgsql security invoker set search_path=''
as $$
declare v integer;
begin
 update stage_private.members set level=greatest(level,1)
 where auth_user_id=p_uid returning level into v;
 if v is null then raise exception 'NOT_REGISTERED' using errcode='42501'; end if;
 return v;
end $$;
create or replace function public.beagu_stage_issue_proof(p_hash text)
returns boolean language plpgsql security invoker set search_path=''
as $$
begin
 if p_hash !~ '^[a-f0-9]{64}$' then return false; end if;
 insert into stage_private.level1_proofs(token_sha,expires_at)
 values(p_hash,now()+interval '30 minutes');
 return true;
end $$;
create or replace function public.beagu_stage_claim(p_uid uuid,p_hash text)
returns integer language plpgsql security invoker set search_path=''
as $$
declare n integer; v integer;
begin
 delete from stage_private.level1_proofs where token_sha=p_hash
 and expires_at>now() returning 1 into n;
 if n is distinct from 1 then raise exception 'PROOF_INVALID' using errcode='28000'; end if;
 update stage_private.members set level=greatest(level,1)
 where auth_user_id=p_uid returning level into v;
 if v is null then raise exception 'NOT_REGISTERED' using errcode='42501'; end if;
 return v;
end $$;
create or replace function public.beagu_stage_register_referral(p_uid uuid,p_hash text)
returns boolean language plpgsql security invoker set search_path=''
as $$
declare v integer; stored text;
begin
 if p_hash !~ '^[a-f0-9]{64}$' then return false; end if;
 select level into v from stage_private.members where auth_user_id=p_uid;
 if coalesce(v,0)<1 then raise exception 'LEVEL1_REQUIRED' using errcode='42501'; end if;
 insert into stage_private.referrals(referrer,token_sha) values(p_uid,p_hash)
 on conflict(referrer) do nothing;
 select token_sha into stored from stage_private.referrals
 where referrer=p_uid and revoked_at is null;
 return stored=p_hash;
end $$;
create or replace function public.beagu_stage_credit(p_respondent uuid,p_hash text)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare owner_id uuid; was_inserted uuid;
begin
 if p_respondent is null or p_hash !~ '^[a-f0-9]{64}$' then
  raise exception 'INVALID_SUBMISSION' using errcode='22023'; end if;
 select referrer into owner_id from stage_private.referrals
 where token_sha=p_hash and revoked_at is null for update;
 if owner_id is null then return jsonb_build_object('credited',false,'reason','invalid_referral'); end if;
 if owner_id=p_respondent then return jsonb_build_object('credited',false,'reason','self_referral'); end if;
 if not exists(select 1 from stage_private.members where auth_user_id=p_respondent) then
  return jsonb_build_object('credited',false,'reason','respondent_not_registered'); end if;
 insert into stage_private.submissions(respondent,referrer,referral_sha)
 values(p_respondent,owner_id,p_hash)
 on conflict(respondent) do nothing returning respondent into was_inserted;
 if was_inserted is null then return jsonb_build_object('credited',false,'reason','duplicate'); end if;
 update stage_private.members set
 level=greatest(level,2), upgrade_unseen=(level<2 or upgrade_unseen)
 where auth_user_id=owner_id;
 return jsonb_build_object('credited',true,'reason','upgraded');
end $$;
create or replace function public.beagu_stage_ack(p_uid uuid)
returns boolean language plpgsql security invoker set search_path=''
as $$
begin
 update stage_private.members set upgrade_unseen=false
 where auth_user_id=p_uid and level=2;
 return found;
end $$;
create or replace function public.beagu_stage_rate(p_hash text,p_max int)
returns boolean language plpgsql security invoker set search_path=''
as $$
declare n integer;
begin
 if p_hash !~ '^[a-f0-9]{64}$' or p_max not between 1 and 100 then return false; end if;
 insert into stage_private.rate_limits(digest,attempts) values(p_hash,1)
 on conflict(digest) do update set
 attempts=case when stage_private.rate_limits.started_at<now()-interval '15 minutes'
 then 1 else stage_private.rate_limits.attempts+1 end,
 started_at=case when stage_private.rate_limits.started_at<now()-interval '15 minutes'
 then now() else stage_private.rate_limits.started_at end
 returning attempts into n;
 return n<=p_max;
end $$;
create or replace function public.beagu_stage_schools()
returns jsonb language sql stable security invoker set search_path=''
as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'region',s.region,
 'year',s.survey_year,'score',s.score) order by s.id),'[]'::jsonb)
 from stage_private.fake_schools s;
$$;
-- All public-schema RPCs are invoker-only and callable solely by service_role.
revoke all on function public.beagu_stage_member(uuid) from public,anon,authenticated;
revoke all on function public.beagu_stage_owner(text) from public,anon,authenticated;
revoke all on function public.beagu_stage_register(uuid,text) from public,anon,authenticated;
revoke all on function public.beagu_stage_level1(uuid) from public,anon,authenticated;
revoke all on function public.beagu_stage_issue_proof(text) from public,anon,authenticated;
revoke all on function public.beagu_stage_claim(uuid,text) from public,anon,authenticated;
revoke all on function public.beagu_stage_register_referral(uuid,text) from public,anon,authenticated;
revoke all on function public.beagu_stage_credit(uuid,text) from public,anon,authenticated;
revoke all on function public.beagu_stage_ack(uuid) from public,anon,authenticated;
revoke all on function public.beagu_stage_rate(text,integer) from public,anon,authenticated;
revoke all on function public.beagu_stage_schools() from public,anon,authenticated;
grant execute on function public.beagu_stage_member(uuid) to service_role;
grant execute on function public.beagu_stage_owner(text) to service_role;
grant execute on function public.beagu_stage_register(uuid,text) to service_role;
grant execute on function public.beagu_stage_level1(uuid) to service_role;
grant execute on function public.beagu_stage_issue_proof(text) to service_role;
grant execute on function public.beagu_stage_claim(uuid,text) to service_role;
grant execute on function public.beagu_stage_register_referral(uuid,text) to service_role;
grant execute on function public.beagu_stage_credit(uuid,text) to service_role;
grant execute on function public.beagu_stage_ack(uuid) to service_role;
grant execute on function public.beagu_stage_rate(text,integer) to service_role;
grant execute on function public.beagu_stage_schools() to service_role;