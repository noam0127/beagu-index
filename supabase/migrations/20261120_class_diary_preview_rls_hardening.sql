-- Protect the visual novel preview gate and brute-force attempt counter.
-- The existing access functions are owned by postgres and SECURITY DEFINER.
-- No anon/authenticated policies: users cannot read or manipulate PIN hashes or attempt budgets.
alter table beagu_private.class_diary_preview_gate enable row level security;
alter table beagu_private.class_diary_preview_attempts enable row level security;
revoke all on beagu_private.class_diary_preview_gate from anon, authenticated, public;
revoke all on beagu_private.class_diary_preview_attempts from anon, authenticated, public;
