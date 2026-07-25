-- 0022_renewals.sql
-- Renewal tracking (audit rec #10): package renewal date per client, surfaced
-- on the dashboard and pinged by the daily cron at 30d / 7d / day-of.

alter table public.clients
    add column if not exists package_renews_on date;

-- Allow the new 'renewal_due' notification kind.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
    check (kind in
        ('lead_new','lead_won','lead_lost','deliverable_approved',
         'project_signoff','invoice_issued','invoice_paid','invoice_overdue',
         'onboarding_submitted','stage_advanced','content_draft_submitted',
         'content_changes_requested','content_approved','quote_sent',
         'quote_accepted','task_due_soon','renewal_due','system'));
