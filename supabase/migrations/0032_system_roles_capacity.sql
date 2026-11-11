-- 0032_system_roles_capacity.sql
-- System roles (permission sets, several per person) separate from the company
-- role; per-person capacity: weekly hours, hours-per-task-type table, cost rate.
-- Task shares (works.split JSONB) gain an `hours` field — no schema change.
-- Shape: app/src/lib/dev-store/team.ts.

alter table public.team_members
    add column if not exists system_roles  text[]  not null default '{}'::text[],
    add column if not exists weekly_hours  numeric not null default 40,
    add column if not exists hours_by_type jsonb   not null default '{}'::jsonb,
    add column if not exists cost_rate_myr numeric not null default 0;

-- Backfill from the legacy access level.
update public.team_members
set system_roles = case when access_level = 'admin' then '{admin,management}'::text[] else '{member}'::text[] end
where cardinality(system_roles) = 0;
