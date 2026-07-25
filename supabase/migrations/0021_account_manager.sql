-- 0021_account_manager.sql
-- Account manager per client (playbook slide 3, made enforceable): the single
-- point of contact who owns updates, approvals-chasing, and renewals.
-- Stores the team member's NAME (matches team_members.name, like stage PICs).

alter table public.clients
    add column if not exists account_manager text not null default '';
