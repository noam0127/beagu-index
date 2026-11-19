-- Temporary Class Diary preview. No PIN, visitor identity or private code is checked into GitHub.
-- The preview PIN is supplied only through the Supabase Edge Function secret
-- CLASS_DIARY_PREVIEW_PIN. Tables remain private and RPC calls are service-role only.

create table if not exists beagu_private.class_diary_preview_gate (
  gate_id integer primary key check (gate_id=1),
  pin_hash text not null,
  preview_subject uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);
revoke all on beagu_private.class_diary_preview_gate from public, anon, authenticated;

create table if not exists beagu_private.class_diary_preview_attempts (
  bucket timestamptz primary key,
  attempts integer not null default 0
);
revoke all on beagu_private.class_diary_preview_attempts from public, anon, authenticated;

create or replace function public.beagu_class_diary_preview_subject(p_pin text)
returns uuid language sql stable security definer set search_path='' as $$
 select preview_subject from beagu_private.class_diary_preview_gate
 where gate_id=1 and p_pin ~ '^[0-9]{4}$'
   and pin_hash=extensions.crypt(p_pin,pin_hash)
 limit 1
$$;
revoke all on function public.beagu_class_diary_preview_subject(text) from public, anon, authenticated;
grant execute on function public.beagu_class_diary_preview_subject(text) to service_role;

create or replace function public.beagu_consume_class_diary_preview_budget()
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 delete from beagu_private.class_diary_preview_attempts
 where bucket < pg_catalog.date_trunc('hour',pg_catalog.now()) - interval '2 day';
 insert into beagu_private.class_diary_preview_attempts(bucket,attempts)
 values(pg_catalog.date_trunc('hour',pg_catalog.now()),1)
 on conflict(bucket) do update
 set attempts=beagu_private.class_diary_preview_attempts.attempts+1
 returning attempts into n;
 return n<=8;
end $$;
revoke all on function public.beagu_consume_class_diary_preview_budget() from public, anon, authenticated;
grant execute on function public.beagu_consume_class_diary_preview_budget() to service_role;

create table if not exists beagu_private.class_diary_preview_progress (
  id integer primary key check (id=1),
  state jsonb not null check (pg_catalog.jsonb_typeof(state)='object'),
  revision bigint not null check (revision>0),
  updated_at timestamptz not null default now()
);
alter table beagu_private.class_diary_preview_progress enable row level security;
revoke all on beagu_private.class_diary_preview_progress from public, anon, authenticated;

create or replace function public.beagu_class_diary_preview_progress_read()
returns jsonb language sql stable security definer set search_path='' as $$
 select pg_catalog.jsonb_build_object('state',p.state,'revision',p.revision,'updatedAt',p.updated_at)
 from beagu_private.class_diary_preview_progress p where p.id=1
$$;
revoke all on function public.beagu_class_diary_preview_progress_read() from public, anon, authenticated;
grant execute on function public.beagu_class_diary_preview_progress_read() to service_role;

create or replace function public.beagu_class_diary_preview_progress_write(p_expected_revision bigint,p_state jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_expected_revision is null or p_expected_revision<0
    or p_state is null or pg_catalog.jsonb_typeof(p_state)<>'object'
    or pg_catalog.pg_column_size(p_state)>32768 then return null; end if;
 insert into beagu_private.class_diary_preview_progress as p (id,state,revision,updated_at)
 values (1,p_state,1,pg_catalog.now())
 on conflict(id) do update
 set state=excluded.state,revision=p.revision+1,updated_at=pg_catalog.now()
 where p.revision=p_expected_revision
 returning pg_catalog.jsonb_build_object('revision',revision,'updatedAt',updated_at) into result;
 return result;
end $$;
revoke all on function public.beagu_class_diary_preview_progress_write(bigint,jsonb) from public, anon, authenticated;
grant execute on function public.beagu_class_diary_preview_progress_write(bigint,jsonb) to service_role;
