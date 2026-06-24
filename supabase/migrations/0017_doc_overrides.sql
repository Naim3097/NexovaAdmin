-- 0008_doc_overrides.sql
-- Per-document editable overrides for invoices AND quotations:
--   bill_to_address  — client address shown under the bill-to / prepared-for name
--   payment_details  — free-text payment/terms block; when set, replaces the
--                      agency bank details on the document + its PDF
--   logo_choice      — which logo shows: '' = agency default · 'none' = hide ·
--                      otherwise a logo id from agency_profile.logos
-- All additive + idempotent; defaults preserve current behaviour (inherit agency).

alter table public.invoices
    add column if not exists bill_to_address text not null default '',
    add column if not exists payment_details text not null default '',
    add column if not exists logo_choice     text not null default '';

alter table public.quotations
    add column if not exists bill_to_address text not null default '',
    add column if not exists payment_details text not null default '',
    add column if not exists logo_choice     text not null default '';
