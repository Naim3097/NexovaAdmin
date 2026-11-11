-- 0034_contract_handover.sql
-- Account-manager handover on a contract: only the current AM can ask someone
-- to take over, and the transfer happens when that person accepts.
-- Shape: app/src/lib/dev-store/contracts.ts (Handover).

alter table public.contracts
    add column if not exists handover jsonb;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
    add constraint notifications_kind_check
    check (kind in (
        'lead_new','lead_won','lead_lost',
        'deliverable_approved','work_requested','approval_requested','work_approved',
        'invoice_issued','invoice_paid','invoice_overdue',
        'onboarding_submitted','stage_advanced',
        'content_draft_submitted','content_changes_requested','content_approved',
        'quote_sent','quote_accepted',
        'task_due_soon','renewal_due',
        'handover_requested','handover_accepted','handover_declined',
        'system'
    ));
