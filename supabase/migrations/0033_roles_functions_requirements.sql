-- 0033_roles_functions_requirements.sql
-- 1. System roles collapse to admin | management | user; duties become FUNCTIONS
--    (account_manager, sales, finance) with reserved weekly hours per hat.
-- 2. Contracts are created from REQUIREMENTS ("3 posts a month …") with a CREW
--    (default person per seat); the proposal link (planner_id) goes away.
-- Shapes: app/src/lib/dev-store/team.ts, app/src/lib/dev-store/contracts.ts.

alter table public.team_members
    add column if not exists functions      text[] not null default '{}'::text[],
    add column if not exists reserved_hours jsonb  not null default '{}'::jsonb;

-- Legacy role names from the first cut → functions + user.
update public.team_members
set functions = array(select unnest(system_roles) intersect select unnest('{account_manager,sales,finance}'::text[]))
where system_roles && '{account_manager,sales,finance}'::text[] and cardinality(functions) = 0;

update public.team_members
set system_roles = case
        when system_roles && '{admin}'::text[] then array['admin', 'management']::text[]
        when system_roles && '{management}'::text[] then array['management']::text[]
        else array['user']::text[]
    end
where system_roles && '{account_manager,sales,finance,member}'::text[];

alter table public.contracts
    drop column if exists planner_id,
    add column if not exists requirements jsonb not null default '[]'::jsonb,
    add column if not exists crew         jsonb not null default '{}'::jsonb;
