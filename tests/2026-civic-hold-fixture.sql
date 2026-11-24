create table public.schools(school_id text primary key,school_name text);
insert into public.schools values('A000001','Synthetic school');
alter table public.beagu_2026_results_snapshot add column approval_evidence jsonb;
