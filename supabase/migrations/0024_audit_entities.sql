-- 0024_audit_entities.sql
-- Align the audit_events entity constraint with the code's AUDIT_ENTITIES.
-- The 0007 list was missing 'quotation' (quotation audit rows have been
-- silently dropped since — recordAudit is deliberately non-fatal) and 'client'
-- (new: portal-revoke audit from offboarding SOP 6).

alter table public.audit_events drop constraint if exists audit_events_entity_check;
alter table public.audit_events add constraint audit_events_entity_check
    check (entity in
        ('lead','project','invoice','quotation','campaign','content','client'));
