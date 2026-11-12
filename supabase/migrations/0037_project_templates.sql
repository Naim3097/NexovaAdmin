-- Project templates: saved starting points for a project (months, deliverables,
-- phase template). "New project" offers Custom or a template; picking one
-- prefills the form. A template change never touches existing projects, which
-- keep only the template's name for reporting.

create table if not exists public.project_templates (
    id uuid primary key,
    name text not null,
    description text not null default '',
    months integer not null default 3 check (months between 1 and 36),
    -- Requirement[]: [{ type, count, cadence: 'monthly' | 'once', channel }]
    requirements jsonb not null default '[]'::jsonb,
    phase_template_id uuid references public.phase_templates (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.contracts
    add column if not exists template_name text not null default '';

comment on table public.project_templates is
    'Saved starting points for projects: term in months, deliverables, phase template.';
comment on column public.contracts.template_name is
    'Project template the project was created from; empty when custom.';
