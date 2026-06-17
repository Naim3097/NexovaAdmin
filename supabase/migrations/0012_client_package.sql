-- 0012_client_package.sql
-- Each client is on a custom monthly retainer: a fixed fee that buys an included
-- content quota + revisions. Charged in full regardless of usage; extras bill on
-- top. The included amounts are the existing monthly_content_quota +
-- content_revision_limit; this adds the base fee + a package label.
--
--   clients.monthly_retainer_myr — fixed monthly fee (e.g. 5500.00)
--   clients.package_name         — label for the package (e.g. "Growth")

alter table public.clients
    add column if not exists monthly_retainer_myr numeric(12,2) not null default 0,
    add column if not exists package_name         text         not null default '';
