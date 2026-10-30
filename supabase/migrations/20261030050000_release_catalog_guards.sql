alter table public.beagu_metric_catalog add constraint metric_verified_evidence_required
 check (not verified or (verification_evidence is not null and length(trim(verification_evidence))>0));
alter table public.beagu_metric_catalog add constraint no_free_text_2026
 check (survey_year<>2026 or question_id !~ '^Q51($|[._-])');
alter table beagu_master.school_records add constraint matched_school_required
 check (match_status<>'MATCHED' or school_id is not null);
alter table public.beagu_release_metrics_v2 drop constraint beagu_release_metrics_v2_topic_check;
alter table public.beagu_release_metrics_v2 add constraint beagu_release_metrics_v2_topic_check
 check (topic in ('시설','복무','업무','조직문화','교육활동','0904','공시지가','공시가격'));
