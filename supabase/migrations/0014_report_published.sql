-- 0014_report_published.sql
-- Agency reviews/edits a report's AI overview, then PUBLISHES it to the client
-- portal. Until published, the client doesn't see the monthly report.

alter table public.report_insights
    add column if not exists published boolean not null default false;
