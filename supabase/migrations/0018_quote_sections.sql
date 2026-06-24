-- 0018_quote_sections.sql
-- Structured quotation document sections (quotations only):
--   subject         — document title, e.g. "Website Enhancement & Backend Optimization"
--   scope_includes  — bulleted "Scope includes" block (one bullet per line)
--   exclusions      — bulleted "Exclusions" block (one bullet per line)
--   terms           — bulleted "Terms & Conditions" block (one per line)
--   show_acceptance — whether to print the Name/Designation/Company/Signature/Date block
-- Agency-level defaults pre-fill new quotes (still editable per quote):
--   default_quote_terms      — default T&C text copied onto each new quote
--   default_quote_acceptance — default for show_acceptance on new quotes
-- All additive + idempotent.

alter table public.quotations
    add column if not exists subject         text not null default '',
    add column if not exists scope_includes  text not null default '',
    add column if not exists exclusions      text not null default '',
    add column if not exists terms           text not null default '',
    add column if not exists show_acceptance boolean not null default true;

alter table public.agency_profile
    add column if not exists default_quote_terms      text not null default '',
    add column if not exists default_quote_acceptance boolean not null default true;
