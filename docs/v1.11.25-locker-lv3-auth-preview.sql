-- PREVIEW ONLY. Install after the existing v1.11.23 Lv3 account schema.
-- No duplicate accounts, password/recovery data, or changes to level sessions.
begin;
create schema if not exists beagu_private;
-- A separate, private ownership link may be populated ONLY after independently
-- verified legacy ownership. No automatic transfer based on a participation code.
create table beagu_private.beagu_locker_legacy_actor_links_v1(
 account_id uuid primary key references public.beagu_lv3_accounts(account_id),
 author_uid uuid not null unique references public.beagu_postit_member_accounts(author_uid)
);
alter table beagu_private.beagu_locker_legacy_actor_links_v1 enable row level security;
revoke all on beagu_private.beagu_locker_legacy_actor_links_v1 from public,anon,authenticated,service_role;
CREATE TABLE beagu_private.beagu_postit_restrictions_v1(
 case_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 target_type text NOT NULL CHECK(target_type IN ('post','comment')),
 target_id uuid NOT NULL,
 author_uid uuid NOT NULL,
 decision text NOT NULL CHECK(decision IN ('dismiss','restrict_24h','restrict_7d')),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz,
 restored_at timestamptz,
 actor_admin uuid NOT NULL,
 restore_admin uuid,
 restore_reason text,
 reason text NOT NULL CHECK(length(reason) BETWEEN 8 AND 200),
 UNIQUE(target_type,target_id)
);
CREATE INDEX beagu_postit_restrictions_author_idx ON beagu_private.beagu_postit_restrictions_v1(author_uid,expires_at) WHERE restored_at IS NULL AND expires_at IS NOT NULL;
ALTER TABLE beagu_private.beagu_postit_restrictions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON beagu_private.beagu_postit_restrictions_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION beagu_private.beagu_postit_restricted_v1(p_author uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM beagu_private.beagu_postit_restrictions_v1 WHERE author_uid=p_author AND restored_at IS NULL AND expires_at>now())
$$;
REVOKE ALL ON FUNCTION beagu_private.beagu_postit_restricted_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Reads require a nonexpired server-issued Lv3 session bound to the same
-- earned visitor; a bare Lv2 participation code is never an account.
create function beagu_private.beagu_locker_principal_v1(p_token_sha text)
returns table(account_id uuid,visitor_id uuid,author_uid uuid)
language sql stable security definer set search_path='' as $$
 select a.account_id,a.visitor_id,coalesce(b.author_uid,a.account_id)
 from public.beagu_level_sessions s
 join public.beagu_lv3_accounts a on a.account_id=s.level3_account_id and a.visitor_id=s.identity_visitor_id
 left join beagu_private.beagu_locker_legacy_actor_links_v1 b on b.account_id=a.account_id
 where p_token_sha ~ '^[a-f0-9]{64}$' and s.token_sha256=p_token_sha
 and s.access_level=2 and s.identity_campaign='2026' and s.expires_at>now()
 and public.beagu_has_earned_challenge_visitor(a.visitor_id) is true
 and (b.author_uid is null or exists(select 1 from public.beagu_postit_member_accounts m where m.author_uid=b.author_uid and m.identity_visitor_id=a.visitor_id))
$$;
revoke all on function beagu_private.beagu_locker_principal_v1(text) from public,anon,authenticated,service_role;
create function public.beagu_locker_notification_actor_v1(p_token_sha text)
returns uuid language sql stable security definer set search_path='' as $$
 select p.author_uid from beagu_private.beagu_locker_principal_v1(p_token_sha) p
$$;
create function public.beagu_locker_writer_v1(p_token_sha text)
returns uuid language sql stable security definer set search_path='' as $$
 select p.author_uid from beagu_private.beagu_locker_principal_v1(p_token_sha) p
 where not beagu_private.beagu_postit_restricted_v1(p.author_uid)
 and not exists(select 1 from public.beagu_postit_member_accounts m where m.identity_visitor_id=p.visitor_id and
  (m.status<>'active' or beagu_private.beagu_postit_restricted_v1(m.author_uid)
   or (m.author_uid<>p.author_uid and (
    exists(select 1 from public.beagu_postit_posts x where x.author_uid=m.author_uid)
    or exists(select 1 from public.beagu_postit_comments x where x.author_uid=m.author_uid)
    or exists(select 1 from public.beagu_postit_reactions x where x.author_uid=m.author_uid)))))
$$;
revoke all on function public.beagu_locker_notification_actor_v1(text),public.beagu_locker_writer_v1(text) from public,anon,authenticated;
grant execute on function public.beagu_locker_notification_actor_v1(text),public.beagu_locker_writer_v1(text) to service_role;
-- Moderation uses only a real content target, not a client-supplied account.
create function beagu_private.beagu_locker_known_actor_v1(p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.beagu_lv3_accounts a where a.account_id=p_actor)
 or exists(select 1 from public.beagu_postit_member_accounts m where m.author_uid=p_actor)
$$;
revoke all on function beagu_private.beagu_locker_known_actor_v1(uuid) from public,anon,authenticated,service_role;
CREATE FUNCTION public.beagu_postit_report_queue_v1()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH reported AS (
 SELECT r.target_type,r.target_id,count(DISTINCT r.author_uid) AS reports
 FROM public.beagu_postit_reactions r WHERE r.kind='report' GROUP BY r.target_type,r.target_id
 ), targets AS (
 SELECT 'post'::text AS target_type,p.id AS target_id,p.body,p.status,p.author_uid FROM public.beagu_postit_posts p
 UNION ALL SELECT 'comment',c.id,c.body,c.status,c.author_uid FROM public.beagu_postit_comments c
 ), rows AS (
 SELECT t.target_type,t.target_id,t.body,t.status,r.reports,d.case_id,d.decision,d.expires_at,d.restored_at
 FROM reported r JOIN targets t USING(target_type,target_id)

 LEFT JOIN beagu_private.beagu_postit_restrictions_v1 d USING(target_type,target_id)
 WHERE beagu_private.beagu_locker_known_actor_v1(t.author_uid) AND t.status IN ('published','hidden','removed') AND (d.case_id IS NULL OR (d.expires_at>now() AND d.restored_at IS NULL))
 ORDER BY (d.case_id IS NULL) DESC,r.reports DESC,t.target_id LIMIT 50
 )
 SELECT coalesce(jsonb_agg(to_jsonb(rows)),'[]'::jsonb) FROM rows
$$;
CREATE FUNCTION public.beagu_postit_report_decide_v1(p_type text,p_target uuid,p_decision text,p_reason text,p_admin uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_author uuid; v_case uuid; v_exp timestamptz;
BEGIN
 IF p_type IS NULL OR p_type NOT IN ('post','comment') OR p_target IS NULL OR p_decision IS NULL OR p_decision NOT IN ('dismiss','restrict_24h','restrict_7d','restore') OR p_admin IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 8 AND 200 THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.beagu_admin_accounts WHERE user_id=p_admin AND role='owner' AND enabled=true) THEN RETURN NULL; END IF;
 -- Only an actual reported content item can be selected, never a supplied member ID.
 IF p_type='post' THEN SELECT author_uid INTO v_author FROM public.beagu_postit_posts WHERE id=p_target;
 ELSE SELECT author_uid INTO v_author FROM public.beagu_postit_comments WHERE id=p_target; END IF;
 IF v_author IS NULL OR NOT beagu_private.beagu_locker_known_actor_v1(v_author) THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(v_author::text),20261121);
 IF NOT EXISTS(SELECT 1 FROM public.beagu_postit_reactions WHERE target_type=p_type AND target_id=p_target AND kind='report' AND author_uid<>v_author) THEN RETURN NULL; END IF;
 IF p_decision='restore' THEN
 UPDATE beagu_private.beagu_postit_restrictions_v1 SET restored_at=clock_timestamp(),restore_admin=p_admin,restore_reason=btrim(p_reason) WHERE target_type=p_type AND target_id=p_target AND author_uid=v_author AND expires_at>now() AND restored_at IS NULL RETURNING case_id INTO v_case;
 ELSE
 v_exp:=CASE p_decision WHEN 'restrict_24h' THEN clock_timestamp()+interval '24 hours' WHEN 'restrict_7d' THEN clock_timestamp()+interval '7 days' ELSE NULL END;
 INSERT INTO beagu_private.beagu_postit_restrictions_v1(target_type,target_id,author_uid,decision,expires_at,actor_admin,reason)
 VALUES(p_type,p_target,v_author,p_decision,v_exp,p_admin,btrim(p_reason)) ON CONFLICT(target_type,target_id) DO NOTHING RETURNING case_id INTO v_case;
 END IF;
 IF v_case IS NULL THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('ok',true,'case_id',v_case);
END $$;
REVOKE ALL ON FUNCTION public.beagu_postit_report_queue_v1(),public.beagu_postit_report_decide_v1(text,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.beagu_postit_report_queue_v1(),public.beagu_postit_report_decide_v1(text,uuid,text,text,uuid) TO service_role;
-- Recheck the restriction in the write transaction (also covers requests already in flight).
CREATE FUNCTION beagu_private.beagu_postit_restriction_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_author uuid;
BEGIN
 IF TG_OP='DELETE' THEN v_author:=OLD.author_uid; ELSE v_author:=NEW.author_uid; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(v_author::text),20261121);
 -- This VOLATILE trigger executes a fresh query after taking the author lock,
 -- rather than relying on the stable snapshot of a request that started earlier.
 IF EXISTS(SELECT 1 FROM beagu_private.beagu_postit_restrictions_v1 WHERE author_uid=v_author AND restored_at IS NULL AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'POSTIT_RESTRICTED' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION beagu_private.beagu_postit_restriction_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER beagu_postit_restrict_post BEFORE INSERT ON public.beagu_postit_posts FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_postit_restriction_guard_v1();
CREATE TRIGGER beagu_postit_restrict_comment BEFORE INSERT ON public.beagu_postit_comments FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_postit_restriction_guard_v1();
CREATE TRIGGER beagu_postit_restrict_reaction BEFORE INSERT OR DELETE ON public.beagu_postit_reactions FOR EACH ROW EXECUTE FUNCTION beagu_private.beagu_postit_restriction_guard_v1();

commit;
