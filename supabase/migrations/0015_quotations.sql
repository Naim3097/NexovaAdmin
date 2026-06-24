-- 0006_quotations.sql
-- Quotations (estimates): the pre-sale half of the QuickBooks-style flow.
-- Mirrors invoices/invoice_items exactly, plus a `valid_until` date and a
-- one-way `converted_invoice_id` link set when a quote is turned into an invoice.

create table if not exists public.quotations (
    id                   text primary key,
    number               text not null unique,        -- e.g. QUO-2026-0001
    client_name          text not null,
    project_id           text references public.projects(id) on delete set null,
    status               text not null check (status in
                             ('draft','sent','accepted','declined','expired','converted'))
                             default 'draft',
    issue_date           date not null,
    valid_until          date not null,
    tax_rate_pct         numeric(5,2) not null default 6,
    notes                text not null default '',
    -- Set once when converted; on-delete-set-null so deleting the invoice later
    -- doesn't orphan-error the quote.
    converted_invoice_id text references public.invoices(id) on delete set null,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),
    accepted_at          timestamptz
);
create index if not exists quotations_status_idx on public.quotations (status);
create index if not exists quotations_client_idx on public.quotations (client_name);

create table if not exists public.quotation_items (
    id                  text primary key,
    quotation_id        text not null references public.quotations(id) on delete cascade,
    description         text not null default '',
    quantity            numeric(12,2) not null default 1,
    unit_price_myr      numeric(12,2) not null default 0,
    -- Preserve insertion order without timestamps (matches invoice_items).
    sort_order          int not null default 0
);
create index if not exists quotation_items_quotation_idx
    on public.quotation_items (quotation_id);

-- RLS — same single-tenant policy as every other table (0001).
do $$
declare
    t text;
    tables text[] := array['quotations','quotation_items'];
begin
    foreach t in array tables loop
        execute format('alter table public.%I enable row level security', t);
        if not exists (
            select 1 from pg_policies
            where schemaname = 'public' and tablename = t
              and policyname = t || '_authenticated_all'
        ) then
            execute format(
                'create policy %I on public.%I for all to authenticated using (true) with check (true)',
                t || '_authenticated_all', t
            );
        end if;
    end loop;
end $$;

-- Keep updated_at fresh on quotations (reuses the function created in 0001).
drop trigger if exists set_updated_at_quotations on public.quotations;
create trigger set_updated_at_quotations
    before update on public.quotations
    for each row execute function public.set_updated_at();

-- Allow the new quotation notification kinds.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
    check (kind in
        ('lead_new','lead_won','lead_lost','deliverable_approved',
         'project_signoff','invoice_issued','invoice_paid','invoice_overdue',
         'onboarding_submitted','stage_advanced','quote_sent','quote_accepted',
         'system'));
