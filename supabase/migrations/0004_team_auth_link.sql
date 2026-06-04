-- 0004_team_auth_link.sql
-- Link a team_members row to its Supabase auth user so the signed-in user has
-- team context (their role, "my work", default assignee). Nullable: a member
-- row can exist before an auth account is provisioned, and an auth user (e.g.
-- the original owner) can exist without a member row.

alter table public.team_members
    add column if not exists user_id uuid references auth.users(id) on delete set null;

-- One auth user maps to at most one team member.
create unique index if not exists team_members_user_id_key
    on public.team_members (user_id)
    where user_id is not null;
