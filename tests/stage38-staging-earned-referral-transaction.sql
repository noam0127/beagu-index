-- Stage 38 staging-only earned referral integration test.
-- Target: ycwuugggqbunlbwuzvbx. Synthetic records only, fully rolled back.
BEGIN;
DO $test$
DECLARE
 v uuid := 'f38a0000-0000-4000-8000-000000000038';
 c text := 'STAGE38-SYNTHETIC-NOT-A-REAL-CODE';
 d text := repeat('b',64);
BEGIN
 IF EXISTS(SELECT 1 FROM beagu_private.challenge_identity_codes WHERE campaign='stage38-test' AND visitor_id=v) THEN
   RAISE EXCEPTION 'Synthetic fixture collision';
 END IF;
 INSERT INTO beagu_private.challenge_identity_codes(campaign,visitor_id,participant_no,identity_code)
 VALUES('2026',v,380038,c);
 INSERT INTO beagu_private.challenge_referral_profiles(campaign,visitor_id,identity_code_sha256,referral_token_sha256,access_level,valid_referrals,upgraded_at,disabled)
 VALUES('2026',v,encode(extensions.digest(c,'sha256'),'hex'),d,2,1,now(),false);
 INSERT INTO beagu_private.challenge_device_claims(campaign,visitor_id,device_secret_sha256)
 VALUES('2026',v,d);
 IF public.beagu_earned_challenge_visitor(c) IS DISTINCT FROM v THEN RAISE EXCEPTION 'Earned code not accepted'; END IF;
 IF public.beagu_has_earned_challenge_visitor(v) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Earned visitor not accepted'; END IF;
 UPDATE beagu_private.challenge_referral_profiles SET disabled=true WHERE campaign='2026' AND visitor_id=v;
 IF public.beagu_earned_challenge_visitor(c) IS NOT NULL THEN RAISE EXCEPTION 'Disabled code accepted'; END IF;
 IF public.beagu_has_earned_challenge_visitor(v) IS DISTINCT FROM false THEN RAISE EXCEPTION 'Disabled visitor accepted'; END IF;
 UPDATE beagu_private.challenge_referral_profiles SET disabled=false,valid_referrals=0 WHERE campaign='2026' AND visitor_id=v;
 IF public.beagu_earned_challenge_visitor(c) IS NOT NULL THEN RAISE EXCEPTION 'Uncredited code accepted'; END IF;
 IF public.beagu_has_earned_challenge_visitor(v) IS DISTINCT FROM false THEN RAISE EXCEPTION 'Uncredited visitor accepted'; END IF;
END $test$;
SELECT 'PASS_EARNED_REVOKED_UNCREDITED' AS result;
ROLLBACK;
