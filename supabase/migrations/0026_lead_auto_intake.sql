-- 0026: auto-intake marker on leads.
-- Leads inserted by automation (Meta Lead Ads webhook, public website API)
-- carry auto_intake = true and show a "New" remark in the UI until any human
-- action on the lead clears it. Manually created leads stay false.
-- Code deploys safely before this runs (it retries inserts without the
-- column), but the badge only works once this is applied.

alter table public.leads
    add column if not exists auto_intake boolean not null default false;
