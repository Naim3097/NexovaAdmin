-- 0027_contracts.sql
-- Contracts: the signed job we have with a client. Sits under the client;
-- projects, content posts, campaigns and invoices hang off it via contract_id.
-- Billing (cadence / amount / invoice day) is JSONB; the shape lives in
-- app/src/lib/dev-store/contracts.ts.

create table if not exists public.contracts (
    id              text primary key,
    code            text not null unique,                    -- CON-2026-0001
    name            text not null,
    client_name     text not null,                           -- matches clients.name
    account_manager text not null default '',                -- team_members.name
    status          text not null check (status in ('draft','active','completed','cancelled')) default 'draft',
    start_date      date,
    end_date        date,                                    -- null = open-ended
    reference       text not null default '',                -- contract no. / MSA ref
    quotation_id    text,                                    -- quotations.id it came from
    value_myr       numeric(12,2) not null default 0,
    signed_at       date,                                    -- null = NOT SIGNED
    signed_by       text not null default '',
    file_url        text not null default '',
    terms           text not null default '',
    billing         jsonb not null default '{}'::jsonb,
    notes           text not null default '',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index if not exists contracts_client_idx on public.contracts (client_name);
create index if not exists contracts_status_idx on public.contracts (status);

alter table public.contracts enable row level security;
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'contracts'
          and policyname = 'contracts_authenticated_all'
    ) then
        create policy contracts_authenticated_all
            on public.contracts for all to authenticated using (true) with check (true);
    end if;
end $$;

drop trigger if exists set_updated_at_contracts on public.contracts;
create trigger set_updated_at_contracts
    before update on public.contracts
    for each row execute function public.set_updated_at();

-- Work and billing live under a contract (nullable: legacy rows and in-house work).
alter table public.projects      add column if not exists contract_id text;
alter table public.content_posts add column if not exists contract_id text;
alter table public.campaigns     add column if not exists contract_id text;
alter table public.invoices      add column if not exists contract_id text;
create index if not exists projects_contract_idx      on public.projects (contract_id);
create index if not exists content_posts_contract_idx on public.content_posts (contract_id);
create index if not exists campaigns_contract_idx     on public.campaigns (contract_id);
create index if not exists invoices_contract_idx      on public.invoices (contract_id);

-- Audit trail covers contracts.
alter table public.audit_events drop constraint if exists audit_events_entity_check;
alter table public.audit_events add constraint audit_events_entity_check
    check (entity in
        ('lead','project','invoice','quotation','campaign','content','client','contract'));
