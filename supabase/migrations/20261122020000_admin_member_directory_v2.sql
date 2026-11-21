-- Read-only, service-role-only member directory. Do not deploy without security review.
create or replace function public.beagu_admin_member_directory_v2(
 p_search text default '', p_status text default 'all',
 p_sort text default 'newest', p_page integer default 1, p_size integer default 20
) returns jsonb language plpgsql stable security definer
set search_path = '' as $$
declare result jsonb;
begin
 if p_search is null or p_status is null or p_sort is null then
   raise exception 'invalid_directory_parameters';
 end if;
 if p_status not in ('all','confirmed','unconfirmed','suspended')
    or p_sort not in ('newest','oldest','email')
    or p_page not between 1 and 1000000 or p_size not between 1 and 100
    or length(p_search)>100 then
   raise exception 'invalid_directory_parameters';
 end if;
 with matched as (
   select u.id,u.email,u.email_confirmed_at,u.created_at,u.last_sign_in_at,u.banned_until
   from auth.users u
   where (coalesce(p_search,'')='' or strpos(lower(coalesce(u.email,'')),lower(p_search))>0
     or strpos(u.id::text,lower(p_search))>0)
     and (p_status='all'
       or (p_status='confirmed' and u.email_confirmed_at is not null)
       or (p_status='unconfirmed' and u.email_confirmed_at is null)
       or (p_status='suspended' and u.banned_until>now()))
 ), page_rows as (
   select * from matched
   order by
     case when p_sort='newest' then created_at end desc nulls last,
     case when p_sort='oldest' then created_at end asc nulls last,
     case when p_sort='email' then lower(email) end asc nulls last,
     id asc
   limit p_size offset (p_page-1)*p_size
 )
 select jsonb_build_object(
   'rows',coalesce((select jsonb_agg(to_jsonb(p)) from page_rows p),'[]'::jsonb),
   'total_matches',(select count(*) from matched),
   'total_users_scanned',(select count(*) from auth.users),
   'total_admins_scanned',(select count(*) from auth.users u where exists(select 1 from public.beagu_admin_accounts a where a.user_id=u.id)),
   'unconfirmed_scanned',(select count(*) from auth.users where email_confirmed_at is null),
   'suspended_scanned',(select count(*) from auth.users where banned_until>now()),
   'truncated',false,
   'search_scope','complete',
   'page',p_page,'page_size',p_size
 ) into result;
 return result;
end $$;
revoke all on function public.beagu_admin_member_directory_v2(text,text,text,integer,integer)
 from public,anon,authenticated;
grant execute on function public.beagu_admin_member_directory_v2(text,text,text,integer,integer)
 to service_role;
