-- Internal clients and the four-step project lifecycle.
--
-- 1. clients.internal: our own company. Its projects are internal — no
--    contract to sign (management approves the brief instead), no money,
--    left out of sales, finance and client reporting, kept in delivery,
--    capacity and everyone's tasks.
-- 2. contracts.stage: Draft → Signed → Running → Closed. The old "onboarding"
--    and "official" steps fold into signed and delivering.

alter table public.clients
    add column if not exists internal boolean not null default false;

comment on column public.clients.internal is
    'Our own company: its projects are internal (approved by management, no contract, no money).';

update public.contracts set stage = 'signed' where stage = 'onboarding';
update public.contracts set stage = 'delivering' where stage = 'official';

alter table public.contracts drop constraint if exists contracts_stage_check;
alter table public.contracts
    add constraint contracts_stage_check
    check (stage in ('created', 'signed', 'delivering', 'completed'));
