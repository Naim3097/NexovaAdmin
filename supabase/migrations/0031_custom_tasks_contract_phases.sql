-- 0031_custom_tasks_contract_phases.sql
-- 1. "custom" task type: a free-form contract task with no linked content record.
-- 2. Contract phases: copied from the planner at acceptance, editable afterwards.
--    Shape: app/src/lib/dev-store/planners.ts (PlannerPhase[]).
-- 3. Phase templates: reusable named phase sets applied to proposals/contracts.

alter table public.works drop constraint if exists works_type_check;
alter table public.works
    add constraint works_type_check
    check (type in ('post','campaign','seo','website','branding','custom'));

alter table public.contracts
    add column if not exists phases jsonb not null default '[]'::jsonb;

-- Backfill: contracts frozen from a planner take that planner's phases.
update public.contracts c
set phases = p.phases
from public.planners p
where c.planner_id = p.id
  and c.phases = '[]'::jsonb;

create table if not exists public.phase_templates (
    id          text primary key,
    name        text not null,
    description text not null default '',
    phases      jsonb not null default '[]'::jsonb,
    is_default  boolean not null default false,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create unique index if not exists phase_templates_one_default
    on public.phase_templates ((true)) where is_default;

alter table public.phase_templates enable row level security;
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'phase_templates'
          and policyname = 'phase_templates_authenticated_all'
    ) then
        create policy phase_templates_authenticated_all
            on public.phase_templates for all to authenticated using (true) with check (true);
    end if;
end $$;
