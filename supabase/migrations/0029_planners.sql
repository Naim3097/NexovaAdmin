-- 0029_planners.sql
-- Content planners: the scope document of an engagement. Written on the
-- pipeline deal by the consultant, presented beside the quotation, and frozen
-- into the contract when accepted (every line becomes a work). Structured
-- parts are JSONB; shape: app/src/lib/dev-store/planners.ts.

create table if not exists public.planners (
    id                      text primary key,
    lead_id                 text references public.leads (id) on delete set null,
    client_name             text not null,
    prepared_by             text not null default '',
    title                   text not null default '',
    version                 integer not null default 1,
    status                  text not null default 'draft' check (status in ('draft','presented','accepted')),
    understanding           text not null default '',
    objectives              jsonb not null default '[]'::jsonb,
    pillars                 text not null default '',
    channels                text not null default '',
    phases                  jsonb not null default '[]'::jsonb,
    lines                   jsonb not null default '[]'::jsonb,
    quotation_id            text,
    payment                 jsonb not null default '{}'::jsonb,
    third_party_costs       text not null default '',
    assumptions             text not null default '',
    client_responsibilities text not null default '',
    exclusions              text not null default '',
    terms                   text not null default '',
    review_days             integer not null default 3,
    change_rounds           integer not null default 2,
    valid_until             date,
    presented_at            timestamptz,
    accepted_at             timestamptz,
    accepted_by             text not null default '',
    contract_id             text,
    addenda                 jsonb not null default '[]'::jsonb,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);
create index if not exists planners_lead_idx on public.planners (lead_id);
create index if not exists planners_client_idx on public.planners (client_name);
create index if not exists planners_status_idx on public.planners (status);

alter table public.planners enable row level security;
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'planners'
          and policyname = 'planners_authenticated_all'
    ) then
        create policy planners_authenticated_all
            on public.planners for all to authenticated using (true) with check (true);
    end if;
end $$;

drop trigger if exists set_updated_at_planners on public.planners;
create trigger set_updated_at_planners
    before update on public.planners
    for each row execute function public.set_updated_at();

-- Clients can sit in onboarding between the closed deal and going active.
alter table public.clients drop constraint if exists clients_status_check;
alter table public.clients add constraint clients_status_check
    check (status in ('prospect','onboarding','active','paused','churned'));
