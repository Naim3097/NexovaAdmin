-- 0007_line_details_logos.sql
-- 1) Sub-points on line items: a free-text `details` field (newline = one bullet)
--    rendered under each line's description on quotes/invoices. One price per line.
-- 2) Default sub-points on the services catalog, so picking a saved service can
--    pre-fill the line description + bullets + price.
-- 3) Agency logo library: `logos` holds saved logos (base64 data URLs), `logo_url`
--    is the currently-selected one shown on documents.
-- All additive + idempotent.

alter table public.quotation_items
    add column if not exists details text not null default '';

alter table public.invoice_items
    add column if not exists details text not null default '';

alter table public.services
    add column if not exists details text not null default '';

alter table public.agency_profile
    add column if not exists logo_url text not null default '';

alter table public.agency_profile
    add column if not exists logos jsonb not null default '[]'::jsonb;
