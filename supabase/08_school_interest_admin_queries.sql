-- READ-ONLY, SQL Editor admin-only. Never ship as an anonymous API.
-- Interest counts are traffic, NOT teacher sentiment or school quality.
SELECT s.school_id,s.school_name,e.event_type,count(*) AS recorded_events
FROM public.school_search_events e
JOIN public.schools s ON s.school_id=e.school_id
WHERE e.searched_at>=now()-interval '7 days'
GROUP BY s.school_id,s.school_name,e.event_type
ORDER BY recorded_events DESC,s.school_id LIMIT 100;
-- Keep original event rows private and do NOT publicly publish a school
-- "popularity ranking" until anti-bot review, privacy review and suppression.
