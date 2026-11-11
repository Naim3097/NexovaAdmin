-- 0028_works.sql
-- Contract delivery: a contract carries a lifecycle stage and (optionally) the
-- content planner it was frozen from; WORKS are the tasks under a contract —
-- one row per item (a post, a campaign, an SEO article, a website item), in
-- one month and one phase, with a JSONB responsibility split across team
-- members. Shape: app/src/lib/dev-store/works.ts.

alter table public.contracts add column if not exists planner_id text;
alter table public.contracts add column if not exists stage text not null default 'created'
    check (stage in ('created','signed','onboarding','official','delivering','completed'));

create table if not exists public.works (
    id               text primary key,
    contract_id      text not null references public.contracts (id) on delete cascade,
    client_name      text not null,
    account_manager  text not null default '',
    planner_line_id  text,
    addendum_version integer not null default 0,
    type             text not null check (type in ('post','campaign','seo','website','branding')),
    title            text not null,
    channel          text not null default '',
    month            text not null,                          -- YYYY-MM
    phase_key        text not null default '',
    phase_name       text not null default '',
    due_date         date,
    default_due_date date,
    adjusted_by      text not null default '',
    adjusted_at      timestamptz,
    status           text not null default 'not_started'
        check (status in ('not_started','in_progress','pending_approval','completed')),
    split            jsonb not null default '[]'::jsonb,     -- [{seat, member, pct}]
    approver         text not null default 'am' check (approver in ('none','am','client')),
    milestone        boolean not null default false,
    linked           jsonb,                                   -- {kind, id} | null
    requested_at     timestamptz,
    started_at       timestamptz,
    submitted_at     timestamptz,
    submission       jsonb not null default '{}'::jsonb,
    review           jsonb not null default '{}'::jsonb,
    completed_at     timestamptz,
    notes            text not null default '',
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
create index if not exists works_contract_idx on public.works (contract_id);
create index if not exists works_client_idx on public.works (client_name);
create index if not exists works_month_idx on public.works (month);
create index if not exists works_status_idx on public.works (status);

alter table public.works enable row level security;
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'works'
          and policyname = 'works_authenticated_all'
    ) then
        create policy works_authenticated_all
            on public.works for all to authenticated using (true) with check (true);
    end if;
end $$;

drop trigger if exists set_updated_at_works on public.works;
create trigger set_updated_at_works
    before update on public.works
    for each row execute function public.set_updated_at();

-- Audit trail covers works.
alter table public.audit_events drop constraint if exists audit_events_entity_check;
alter table public.audit_events add constraint audit_events_entity_check
    check (entity in
        ('lead','project','invoice','quotation','campaign','content','client','contract','work','planner'));

-- Task hand-off notifications.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
    check (kind in
        ('lead_new','lead_won','lead_lost','deliverable_approved',
         'work_requested','approval_requested','work_approved',
         'project_signoff','invoice_issued','invoice_paid','invoice_overdue',
         'onboarding_submitted','stage_advanced','content_draft_submitted',
         'content_changes_requested','content_approved','quote_sent',
         'quote_accepted','task_due_soon','renewal_due','system'));
