-- Read-only inventory candidate. Not a migration; no automatic execution.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT jsonb_build_object(
 'postgres_major',current_setting('server_version_num')::integer / 10000,
 'schemas',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',nspname,'relations',relation_count) ORDER BY nspname),'[]'::jsonb)
  FROM (SELECT n.nspname,count(c.oid) AS relation_count FROM pg_catalog.pg_namespace n
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relkind IN ('r','p','f','m','S','v')
  WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' GROUP BY n.nspname) q),
 'extensions',(SELECT count(*) FROM pg_catalog.pg_extension),
 'roles',(SELECT count(*) FROM pg_catalog.pg_roles),
 'role_memberships',(SELECT count(*) FROM pg_catalog.pg_auth_members),
 'sequences',(SELECT count(*) FROM pg_catalog.pg_class WHERE relkind='S'),
 'large_objects',(SELECT count(*) FROM pg_catalog.pg_largeobject_metadata),
 'rls_relations',(SELECT count(*) FROM pg_catalog.pg_class WHERE relrowsecurity),
 'foreign_servers',(SELECT count(*) FROM pg_catalog.pg_foreign_server),
 'database_bytes',pg_catalog.pg_database_size(current_database()),
 'scope','read_only_inventory_candidate',
 'restore_verified',false,'execution_enabled',false
);
ROLLBACK;
