-- Safely patch only the ambiguous alias in the currently deployed credit
-- function, preserving any concurrent review/quality-gate logic. Do not reset
-- another workflow's functions, settings, evidence, or referral events.
do $patch$
declare ddl text;
old_sql text:=E'from beagu_private.challenge_referral_profiles p\n   where p.campaign=\'2026\' and p.referral_token_sha256=p_referral_hash\n     and p.visitor_id=p_respondent_uuid';
new_sql text:=E'from beagu_private.challenge_referral_profiles candidate\n   where candidate.campaign=\'2026\' and candidate.referral_token_sha256=p_referral_hash\n     and candidate.visitor_id=p_respondent_uuid';
begin
 select pg_get_functiondef('public.beagu_referral_credit(text,text,text,uuid)'::regprocedure) into ddl;
 if strpos(ddl,new_sql)>0 then return; end if;
 if strpos(ddl,old_sql)=0 then
   raise exception 'referral function shape changed; do not overwrite unrelated changes';
 end if;
 execute replace(ddl,old_sql,new_sql);
end $patch$;