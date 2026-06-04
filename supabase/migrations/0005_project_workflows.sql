-- 0005_project_workflows.sql
-- Delivery workflows: per-service editable stage templates, instantiated as an
-- ordered, role-owned stage pipeline on each project (replaces AI task lists).

-- Per-project flow: ordered stages copied from a template, then editable.
alter table public.projects
    add column if not exists service_category text not null default '',
    add column if not exists stages jsonb not null default '[]'::jsonb;

-- Editable templates. Defaults live in code (lib/workflows/defaults.ts); a row
-- here is an OVERRIDE for that service. Missing row => use the code default.
create table if not exists public.workflow_templates (
    service_category text primary key
        check (service_category in
            ('website','app','ads','seo','content','branding','retainer','other')),
    name             text not null default '',
    stages           jsonb not null default '[]'::jsonb,
    updated_at       timestamptz not null default now()
);

-- RLS — same single-tenant policy as every other table (0001).
alter table public.workflow_templates enable row level security;
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'workflow_templates'
          and policyname = 'workflow_templates_authenticated_all'
    ) then
        create policy workflow_templates_authenticated_all
            on public.workflow_templates
            for all to authenticated using (true) with check (true);
    end if;
end $$;

-- Keep updated_at fresh (reuses the function created in 0001).
drop trigger if exists set_updated_at_workflow_templates on public.workflow_templates;
create trigger set_updated_at_workflow_templates
    before update on public.workflow_templates
    for each row execute function public.set_updated_at();

-- Allow the new 'stage_advanced' notification kind.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
    check (kind in
        ('lead_new','lead_won','lead_lost','deliverable_approved',
         'project_signoff','invoice_issued','invoice_paid','invoice_overdue',
         'onboarding_submitted','stage_advanced','system'));
