-- Fields the dashboards read.
--
-- 1. leads.lost_reason / lost_note: why a deal was lost (price, timing,
--    competitor, no_response, scope, other; '' until recorded) and a note.
-- 2. agency_profile.sales_target_myr: the monthly target (MYR won) the Sales
--    tab measures signed projects against; 0 = none.
-- 3. works.waiting_on / waiting_since: who a task is blocked on ('client',
--    'internal', '' = nobody), set from the quick edit, and since when.
-- 4. team_members.days_off: days off per month {"YYYY-MM": days}, taken off
--    that month's delivery capacity.
-- 5. clients.last_check_in_at / last_check_in_note: the last time we spoke to
--    the client and what was said.
-- 6. contracts.renewal_status / milestones: where renewal stands as a project
--    nears its end ('' | in_talks | renewing | at_risk | not_renewing |
--    renewed) and, for milestone-billed projects, when each payment falls due
--    ([{ label, date, amountMyr }]).

-- 1. lost reason
alter table public.leads
    add column if not exists lost_reason text not null default '',
    add column if not exists lost_note text not null default '';
comment on column public.leads.lost_reason is
    'Why the deal was lost: price | timing | competitor | no_response | scope | other; empty until recorded.';

-- 2. sales target
alter table public.agency_profile
    add column if not exists sales_target_myr numeric(12, 2) not null default 0;
comment on column public.agency_profile.sales_target_myr is
    'Monthly sales target in MYR won (projects signed); 0 = none.';

-- 3. waiting on
alter table public.works
    add column if not exists waiting_on text not null default '',
    add column if not exists waiting_since timestamptz;
comment on column public.works.waiting_on is
    'Who the task is blocked on: client | internal | empty = nobody. Cleared when the task moves on.';

-- 4. days off
alter table public.team_members
    add column if not exists days_off jsonb not null default '{}'::jsonb;
comment on column public.team_members.days_off is
    'Days off per month as {"YYYY-MM": days}; taken off that month''s delivery capacity.';

-- 5. client check-in
alter table public.clients
    add column if not exists last_check_in_at date,
    add column if not exists last_check_in_note text not null default '';
comment on column public.clients.last_check_in_at is
    'Last time someone from the agency spoke to the client.';

-- 6. renewal + milestones
alter table public.contracts
    add column if not exists renewal_status text not null default '',
    add column if not exists milestones jsonb not null default '[]'::jsonb;
comment on column public.contracts.renewal_status is
    'Renewal standing as the project nears its end: in_talks | renewing | at_risk | not_renewing | renewed; empty = not discussed.';
comment on column public.contracts.milestones is
    'Billing milestones for milestone-billed projects: [{ label, date (YYYY-MM-DD), amountMyr }].';
