-- Packages leave the client.
--
-- A client no longer carries a package: what they bought lives on their
-- PROJECTS (contracts) — the term (start / end date), the deliverables
-- (`requirements`, whose "post" rows are the monthly content), and the
-- billing (`billing.cadence`, `billing.amountMyr`) — and project TEMPLATES
-- (Settings → Templates) are the "package" a new project starts from.
--
-- The app now derives per client:
--   monthly revenue  = sum of billing.amountMyr over active projects billed monthly
--   content a month  = sum of the "post" deliverables over active projects
--   renewal          = the active projects' end dates
-- and extras (content or revisions beyond the plan) are no longer priced on
-- the client; the account manager agrees any charge.
--
-- Kept: clients.content_revision_limit — a rule about how the client reviews,
-- not what they bought. Kept: clients.deal_owner (migration 0039) — who closed
-- the deal; projects carry their own account manager.

alter table public.clients
    drop column if exists package_name,
    drop column if exists package_renews_on,
    drop column if exists monthly_retainer_myr,
    drop column if exists monthly_content_quota,
    drop column if exists extra_content_price,
    drop column if exists extra_revision_price;

comment on table public.clients is
    'The agency''s customers. Money, deliverables and term live on their projects (contracts); templates are the package.';
comment on column public.clients.content_revision_limit is
    'Feedback rounds the client gets per content item (a client rule, not a package term).';
