-- Code-only candidate. Apply only through separately approved operational release.
begin;
create table if not exists public.beagu_school_likes_v1 (
 school_id text not null references public.schools(school_id) on delete restrict,
 visitor_id uuid not null,
 created_at timestamptz not null default now(),
 primary key(school_id,visitor_id)
);
alter table public.beagu_school_likes_v1 enable row level security;
revoke all on public.beagu_school_likes_v1 from public,anon,authenticated;
grant select,insert on public.beagu_school_likes_v1 to service_role;
create or replace function public.beagu_school_like_actor_v1(p_digest text)
returns uuid language sql stable security invoker set search_path='' as $$
 select s.identity_visitor_id from public.beagu_level_sessions s
 where p_digest ~ '^[a-f0-9]{64}$' and s.token_sha256=p_digest and s.expires_at>now()
 and s.access_level=2 and s.identity_campaign='2026' and s.identity_visitor_id is not null
 and public.beagu_has_earned_challenge_visitor(s.identity_visitor_id) is true limit 1;
$$;
create or replace function public.beagu_school_like_state_v1(p_school_ids text[],p_digest text)
returns jsonb language sql stable security invoker set search_path='' as $$
 with actor as (select public.beagu_school_like_actor_v1(p_digest) as id),
 totals as (
 select s.school_id,count(l.visitor_id) as likes,coalesce(bool_or(l.visitor_id=a.id),false) as liked
 from public.schools s cross join actor a left join public.beagu_school_likes_v1 l on l.school_id=s.school_id
 where s.status='운영' and s.school_id=any(p_school_ids) and cardinality(p_school_ids) between 1 and 20
 group by s.school_id
 )
 select jsonb_build_object('canLike',(select id is not null from actor),'schools',coalesce((select jsonb_agg(to_jsonb(t)) from totals t),'[]'::jsonb));
$$;
create or replace function public.beagu_school_like_add_v1(p_school_id text,p_digest text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid;
begin
 actor:=public.beagu_school_like_actor_v1(p_digest);
 if actor is null then return jsonb_build_object('error','LV2_INDIVIDUAL_CODE_REQUIRED'); end if;
 if p_school_id is null or p_school_id !~ '^[A-Z0-9]{7}$' or not exists(select 1 from public.schools s where s.school_id=p_school_id and s.status='운영') then return jsonb_build_object('error','INVALID_SCHOOL'); end if;
 insert into public.beagu_school_likes_v1(school_id,visitor_id) values(p_school_id,actor) on conflict(school_id,visitor_id) do nothing;
 return public.beagu_school_like_state_v1(array[p_school_id],p_digest);
end;
$$;
create or replace function public.beagu_school_like_search_v1(p_keyword text,p_region text,p_office text,p_direction text,p_page integer)
returns jsonb language sql stable security invoker set search_path='' as $$
 with matched as materialized (
 select s.school_id,s.school_name,s.sido,s.sido_standard,s.support_office,s.address,s.establishment,s.status
 from public.schools s
 where s.status='운영' and (p_keyword<>'' or p_region<>'') and (p_keyword='' or strpos(lower(s.school_name),lower(p_keyword))>0)
 and (p_region='' or s.sido_standard=p_region) and (p_office='' or s.support_office=p_office)
 and p_direction in ('asc','desc') and p_page between 0 and 500
 ), ranked as (
 select m.*,count(l.visitor_id) as like_count from matched m
 left join public.beagu_school_likes_v1 l on l.school_id=m.school_id
 group by m.school_id,m.school_name,m.sido,m.sido_standard,m.support_office,m.address,m.establishment,m.status
 ), page as (
 select r.* from ranked r order by case when p_direction='desc' then -r.like_count else r.like_count end,r.school_name,r.school_id
 limit 20 offset (greatest(0,least(500,p_page))*20)
 )
 select jsonb_build_object('schools',coalesce((select jsonb_agg(to_jsonb(p) order by case when p_direction='desc' then -p.like_count else p.like_count end,p.school_name,p.school_id) from page p),'[]'::jsonb),'total',(select count(*) from matched));
$$;
revoke execute on function public.beagu_school_like_actor_v1(text),public.beagu_school_like_state_v1(text[],text),public.beagu_school_like_add_v1(text,text),public.beagu_school_like_search_v1(text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.beagu_school_like_actor_v1(text),public.beagu_school_like_state_v1(text[],text),public.beagu_school_like_add_v1(text,text),public.beagu_school_like_search_v1(text,text,text,text,integer) to service_role;
commit;
