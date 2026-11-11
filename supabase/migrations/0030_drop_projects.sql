-- 0030_drop_projects.sql
-- The Projects module is gone: a CONTRACT is the project now (client →
-- contract → tasks/works by month, see 0027/0028). Drops the project and
-- workflow-template tables, every project_id link on billing / content rows,
-- and re-states the audit-entity and notification-kind checks without the
-- project-era values. Idempotent: every statement is safe to re-run.

-- -----------------------------------------------------------------------------
-- project_id links (invoices + content_posts from 0001, quotations from 0015).
-- sprint_tasks (0019) never had one.
-- -----------------------------------------------------------------------------
alter table public.invoices      drop column if exists project_id;
alter table public.quotations    drop column if exists project_id;
alter table public.content_posts drop column if exists project_id;

-- -----------------------------------------------------------------------------
-- Project tables: projects (0001, +stages/service_category/contract_id from
-- 0005/0027) and the per-service workflow_templates overrides (0005).
-- CASCADE takes their indexes, policies, triggers and any leftover FK.
-- -----------------------------------------------------------------------------
drop table if exists public.workflow_templates cascade;
drop table if exists public.projects cascade;

-- -----------------------------------------------------------------------------
-- Audit trail: 'project' is no longer an entity (list from 0028 minus it).
-- Rows for the dropped records would fail the new check, so they go first.
-- -----------------------------------------------------------------------------
delete from public.audit_events where entity = 'project';
alter table public.audit_events drop constraint if exists audit_events_entity_check;
alter table public.audit_events add constraint audit_events_entity_check
    check (entity in
        ('lead','invoice','quotation','campaign','content','client','contract','work','planner'));

-- -----------------------------------------------------------------------------
-- Notifications: drop the 'project_signoff' kind (list from 0028 minus it).
-- -----------------------------------------------------------------------------
delete from public.notifications where kind = 'project_signoff';
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
    check (kind in
        ('lead_new','lead_won','lead_lost','deliverable_approved',
         'work_requested','approval_requested','work_approved',
         'invoice_issued','invoice_paid','invoice_overdue',
         'onboarding_submitted','stage_advanced','content_draft_submitted',
         'content_changes_requested','content_approved','quote_sent',
         'quote_accepted','task_due_soon','renewal_due','system'));
