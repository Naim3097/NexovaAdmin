-- 0007_content_review.sql
-- Phase 2+3 of the Axtra content-review rebuild: the interactive review loop on
-- content_posts (versioned drafts, client feedback thread, approval). Replaces
-- Axtra's contentSubmissions/revisions. See docs/axtra-content-review-integration.md.
--
-- review_status is an axis ORTHOGONAL to the existing publishing `status`
-- (idea..posted): a post can be status='review' + review_status='awaiting_client'.
--
-- jsonb children mirror the projects.deliverables/stages house style:
--   drafts[]   = { id, draftNumber, fileUrl, caption, submittedAt, submittedBy }
--   feedback[] = { id, draftId, author('client'|'agency'), body, fileUrl, cycle, createdAt }
--
-- All columns added now (Phase 2 uses drafts/review_status; Phase 3 uses
-- feedback/revisions_used/approved_*) so later phases are code-only.

alter table public.content_posts
    add column if not exists review_status    text not null default 'none'
        check (review_status in
            ('none','awaiting_client','changes_requested','approved')),
    add column if not exists draft_number     text not null default '',
    add column if not exists revisions_used   int  not null default 0,
    add column if not exists current_file_url text not null default '',
    add column if not exists drafts           jsonb not null default '[]'::jsonb,
    add column if not exists feedback         jsonb not null default '[]'::jsonb,
    add column if not exists approved_at      timestamptz,
    add column if not exists approved_by      text not null default '';

create index if not exists content_posts_review_status_idx
    on public.content_posts (review_status);

-- New notification kinds for the loop (fan out to in-app + Telegram via notify()).
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
    check (kind in
        ('lead_new','lead_won','lead_lost','deliverable_approved',
         'project_signoff','invoice_issued','invoice_paid','invoice_overdue',
         'onboarding_submitted','stage_advanced',
         'content_draft_submitted','content_changes_requested','content_approved',
         'system'));

-- Allow audit trail entries for content.
alter table public.audit_events drop constraint if exists audit_events_entity_check;
alter table public.audit_events add constraint audit_events_entity_check
    check (entity in ('lead','project','invoice','campaign','content'));
