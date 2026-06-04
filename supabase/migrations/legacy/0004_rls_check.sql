-- 0004_rls_check.sql
-- Helper view consumed by the CI script `npm run db:check-rls`.
-- Exposes per-table rowsecurity flag for the `public` schema.

create or replace view public.pg_tables_meta as
  select schemaname, tablename, rowsecurity
  from pg_tables
  where schemaname = 'public';

-- Restrict: this metadata is harmless but no need to expose to clients.
revoke all on public.pg_tables_meta from anon, authenticated;
grant select on public.pg_tables_meta to service_role;
