do $test$
declare
 a uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 b uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 c uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 d uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 r jsonb;
begin
 if has_function_privilege('anon','public.beagu_referral_credit_quality_gate(text,text,text,uuid,boolean,text[])','execute')
 or has_function_privilege('authenticated','public.beagu_referral_credit_quality_gate(text,text,text,uuid,boolean,text[])','execute')
 or not has_function_privilege('service_role','public.beagu_referral_credit_quality_gate(text,text,text,uuid,boolean,text[])','execute') then
 raise exception 'incorrect credit RPC privileges'; end if;
 insert into beagu_private.challenge_referral_profiles(campaign,visitor_id,referral_token_sha256)
 values('2026',a,repeat('a',64)),('2026',b,repeat('b',64));
 r:=public.beagu_referral_credit_quality_gate(repeat('1',64),repeat('a',64),repeat('a',64),a,true,'{}');
 if r->>'decision' is distinct from 'same_device' then raise exception 'self referral: %',r; end if;
 r:=public.beagu_referral_credit_quality_gate(repeat('2',64),repeat('a',64),repeat('c',64),c,true,array['STRAIGHTLINE_LIKERT']);
 if r->>'decision' is distinct from 'pending_quality_review' then raise exception 'quality hold: %',r; end if;
 if (select access_level from beagu_private.challenge_referral_profiles where visitor_id=a)<>1 then raise exception 'quality hold improperly promoted'; end if;
 r:=public.beagu_referral_credit_quality_gate(repeat('3',64),repeat('a',64),repeat('d',64),d,true,'{}');
 if r->>'credited' is distinct from 'true' then raise exception 'valid credit: %',r; end if;
 if not public.beagu_has_earned_challenge_visitor(a) then raise exception 'missing earned entitlement'; end if;
 r:=public.beagu_referral_credit_quality_gate(repeat('3',64),repeat('a',64),repeat('d',64),d,true,'{}');
 if r->>'credited' is distinct from 'false' then raise exception 'duplicate event credited: %',r; end if;
 r:=public.beagu_referral_credit_quality_gate(repeat('4',64),repeat('b',64),repeat('d',64),d,true,'{}');
 if r->>'credited' is distinct from 'false' or public.beagu_has_earned_challenge_visitor(b) then raise exception 'duplicate respondent promoted: %',r; end if;
 raise notice 'PASS: actual repository SQL quality gate, self referral, pending quality, verified credit, duplicate event/respondent and earned entitlement';
end $test$;
