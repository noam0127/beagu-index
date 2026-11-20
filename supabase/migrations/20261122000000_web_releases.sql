create schema if not exists beagu_private;
create table beagu_private.web_candidates (
 id bigint primary key, sha text not null check(sha ~ '^[a-f0-9]{40}$'),
 digest text check(digest ~ '^[a-f0-9]{64}$'), created_at timestamptz not null default now(),
 staged_at timestamptz, version text not null unique check(version ~ '^[0-9]+\.[0-9]+(\.[0-9]+)?$'),
 title text not null, notes text not null, changes jsonb not null,
 checks jsonb, state text not null check(state in ('testing','failed','passed','cancelled')),
 shipped_at timestamptz, public_note text, published boolean not null default false
);
create table beagu_private.web_deployments (
 id uuid primary key, candidate bigint not null references beagu_private.web_candidates,
 previous bigint references beagu_private.web_candidates, actor uuid not null,
 kind text not null check(kind in ('deploy','rollback')), approved_at timestamptz not null default now(),
 state text not null default 'queued' check(state in ('queued','running','failed','success')),
 run bigint unique, finished_at timestamptz, reason text
);
create unique index web_one_active on beagu_private.web_deployments ((true)) where state in ('queued','running');
create table beagu_private.web_release_events (
 id bigint generated always as identity primary key, at timestamptz default now(), actor uuid, candidate bigint, action text not null
);
alter table beagu_private.web_candidates enable row level security;
alter table beagu_private.web_deployments enable row level security;
alter table beagu_private.web_release_events enable row level security;
revoke all on beagu_private.web_candidates,beagu_private.web_deployments,beagu_private.web_release_events from public,anon,authenticated;

-- Called only by the server. All decisions and transitions share a transaction lock.
create function public.beagu_web_release(p_action text,p jsonb,p_actor uuid default null,p_session uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c beagu_private.web_candidates; d beagu_private.web_deployments; current_id bigint; latest bigint;
begin
 perform pg_catalog.pg_advisory_xact_lock(713256903);
 if p_action in ('list','edit','deploy','rollback','cancel','notice') then
   if not exists(select 1 from public.beagu_admin_accounts where user_id=p_actor and enabled and role='owner')
      or public.beagu_admin_active_mfa_session(p_actor,p_session) is not true then
      raise exception 'owner_session_required'; end if;
 end if;
 select candidate into current_id from beagu_private.web_deployments where state='success' order by finished_at desc limit 1;
 select max(id) into latest from beagu_private.web_candidates;
 select * into c from beagu_private.web_candidates where id=(p->>'candidate')::bigint;
 if p_action='baseline' then return (select to_jsonb(sha) from beagu_private.web_candidates where id=current_id);
 elsif p_action='list' then
   return jsonb_build_object('current_version',(select version from beagu_private.web_candidates where id=current_id),'current',current_id,'latest',latest,'candidates',(select coalesce(jsonb_agg(to_jsonb(x) order by id desc),'[]') from (select * from beagu_private.web_candidates order by id desc limit 100)x),
    'history',(select coalesce(jsonb_agg(to_jsonb(x) order by approved_at desc),'[]') from (select * from beagu_private.web_deployments order by approved_at desc limit 100)x));
 elsif p_action='register' then
   insert into beagu_private.web_candidates(id,sha,version,title,notes,changes,state)
   values ((p->>'candidate')::bigint,p->>'sha',p->>'version',p->>'title',p->>'notes',p->'changes','testing');
 elsif p_action='tested' then
   if c.state is distinct from 'testing' then raise exception 'candidate_locked'; end if;
   update beagu_private.web_candidates set checks=p->'checks',digest=p->>'digest',staged_at=case when p->>'result'='passed' then now() end,
    state=case when p->>'result'='passed' and p->>'digest' is not null and jsonb_array_length(p->'checks')>0
     and not exists(select 1 from jsonb_array_elements(p->'checks') t where t->>'state' is distinct from 'passed') then 'passed' else 'failed' end where id=c.id;
 elsif p_action in ('edit','cancel','deploy','rollback','notice') then
   if p_action in ('deploy','rollback') and (current_id is distinct from (p->>'current')::bigint or c.version is distinct from p->>'version' or c.title is distinct from p->>'title' or c.notes is distinct from p->>'notes') then raise exception 'review_again'; end if;
   if c.id is null then raise exception 'missing_candidate'; end if;
   if exists(select 1 from beagu_private.web_deployments where state in ('queued','running')) then raise exception 'deployment_busy'; end if;
   if p_action='notice' and c.shipped_at is not null then
     update beagu_private.web_candidates set public_note=nullif(left(trim(p->>'public_note'),500),''),published=(p->>'published')::boolean where id=c.id;
   elsif p_action='rollback' and c.shipped_at is not null and c.id is distinct from current_id then
     insert into beagu_private.web_deployments(id,candidate,previous,actor,kind) values((p->>'nonce')::uuid,c.id,current_id,p_actor,'rollback') returning * into d;
   elsif c.shipped_at is null and c.id=latest and c.state='passed' then
     if p_action='edit' then
       update beagu_private.web_candidates set version=p->>'version',title=left(p->>'title',160),notes=left(p->>'notes',5000) where id=c.id;
     elsif p_action='cancel' then update beagu_private.web_candidates set state='cancelled' where id=c.id;
     elsif p_action='deploy' then
       insert into beagu_private.web_deployments(id,candidate,previous,actor,kind) values((p->>'nonce')::uuid,c.id,current_id,p_actor,'deploy') returning * into d;
     else raise exception 'invalid_transition'; end if;
   else raise exception 'ineligible_candidate'; end if;
 elsif p_action in ('claim','finish','dispatch_rejected') then
   select * into d from beagu_private.web_deployments where id=(p->>'request')::uuid;
   if d.id is null then raise exception 'unknown_request'; end if;
   select * into strict c from beagu_private.web_candidates where id=d.candidate;
   if p_action='claim' and d.state='queued' and c.state='passed' then
     insert into beagu_private.web_release_events(actor,candidate,action) values(d.actor,c.id,'claim');
     update beagu_private.web_deployments set state='running',run=(p->>'run')::bigint where id=d.id;
     return to_jsonb(c);
   elsif p_action='finish' and d.state='running' and d.run=(p->>'run')::bigint then
     update beagu_private.web_deployments set state=case when p->>'result'='success' then 'success' else 'failed' end,
     finished_at=now(),reason=left(p->>'reason',500) where id=d.id;
     if p->>'result'='success' then update beagu_private.web_candidates set shipped_at=coalesce(shipped_at,now()) where id=c.id; end if;
   elsif p_action='dispatch_rejected' and d.state='queued' then
     update beagu_private.web_deployments set state='failed',finished_at=now(),reason='GitHub dispatch rejected' where id=d.id;
   else raise exception 'invalid_transition'; end if;
 else raise exception 'unknown_action'; end if;
 insert into beagu_private.web_release_events(actor,candidate,action) values(p_actor,coalesce(c.id,(p->>'candidate')::bigint),p_action);
 return jsonb_build_object('request',d.id);
end $$;
revoke all on function public.beagu_web_release(text,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.beagu_web_release(text,jsonb,uuid,uuid) to service_role;

create function public.beagu_latest_web_notice() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',version,'note',public_note,'date',shipped_at) from beagu_private.web_candidates
 where published and shipped_at is not null and public_note is not null order by shipped_at desc limit 1
$$;
revoke all on function public.beagu_latest_web_notice() from public;
grant execute on function public.beagu_latest_web_notice() to anon,authenticated;
insert into storage.buckets(id,name,public) values('web-release-archives','web-release-archives',false);
