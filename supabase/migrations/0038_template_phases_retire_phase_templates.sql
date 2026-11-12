-- Project templates carry their own phases; phase templates are retired.
--
-- A template's timeline is now a list of relative phases stored on the
-- template itself: TemplatePhase[] = [{ key, name, summary, fromMonth, months }]
-- with fromMonth 1 = the project's first month (see lib/contracts/phases.ts).
-- The old phase_template_id link and the phase_templates table go away.
--
-- Deliverable rows (project_templates.requirements and contracts.requirements)
-- now carry a `name` (the task title) and `per`: 'week' | 'month' | 'once'.
-- Older rows written with `cadence: 'monthly' | 'once'` and no name are still
-- read: the app maps cadence 'monthly' → per 'month' and 'once' → per 'once'
-- on load (lib/contracts/requirements.ts), so no data rewrite is needed.

alter table public.project_templates
    add column if not exists phases jsonb not null default '[]'::jsonb;

alter table public.project_templates
    drop column if exists phase_template_id;

drop table if exists public.phase_templates;

comment on column public.project_templates.phases is
    'TemplatePhase[]: [{ key, name, summary, fromMonth, months }], month 1 = the project''s first month.';
comment on column public.project_templates.requirements is
    'Requirement[]: [{ type, name, count, per: ''week'' | ''month'' | ''once'', channel }]; legacy rows with cadence are read as per = month | once.';
comment on column public.contracts.requirements is
    'Requirement[]: [{ type, name, count, per: ''week'' | ''month'' | ''once'', channel }]; legacy rows with cadence are read as per = month | once.';
comment on table public.project_templates is
    'Saved starting points for projects: term in months, deliverable rows, phase rows.';
