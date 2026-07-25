-- 0023_access_levels.sql
-- Lean role-based access (audit rec #12): per-member access level.
--   admin    — everything, incl. finance (invoices/quotes/reports), agency
--              settings, and team management
--   standard — delivery surfaces only (no finance, no agency/team admin)
-- Bootstrap rule in code: until at least one ACTIVE admin exists, everyone is
-- treated as admin — so applying this migration can never lock anyone out.

alter table public.team_members
    add column if not exists access_level text not null default 'standard'
        check (access_level in ('admin','standard'));
