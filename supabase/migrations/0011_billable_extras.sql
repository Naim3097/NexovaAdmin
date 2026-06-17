-- 0011_billable_extras.sql
-- Extra content / revisions beyond a client's plan are ALLOWED but chargeable.
-- Fixed price per client; flagged items flow into the monthly report and an
-- auto-generated draft invoice.
--
--   clients.extra_content_price   — MYR per content item beyond monthly_content_quota
--   clients.extra_revision_price  — MYR per revision beyond content_revision_limit
--   content_posts.billable        — this item is an extra (created over quota)
--   content_posts.billable_revisions — # of revisions on it that were over the limit

alter table public.clients
    add column if not exists extra_content_price  numeric(12,2) not null default 0,
    add column if not exists extra_revision_price numeric(12,2) not null default 0;

alter table public.content_posts
    add column if not exists billable           boolean not null default false,
    add column if not exists billable_revisions int     not null default 0;
