-- 0008_client_auth.sql
-- Give CLIENTS a login so they get an authenticated portal (not just a token
-- link). Mirrors 0004_team_auth_link for team_members: link a clients row to its
-- Supabase auth user. Nullable — a client can exist before being invited.
--
-- Access separation (enforced in code, src/app/(admin)/layout.tsx): a signed-in
-- user linked to a clients row is a CLIENT and is redirected out of /admin into
-- /portal. Until real per-role RLS lands, this is the guard that stops a client
-- login from reaching agency data.

alter table public.clients
    add column if not exists user_id uuid references auth.users(id) on delete set null;

-- One auth user maps to at most one client.
create unique index if not exists clients_user_id_key
    on public.clients (user_id)
    where user_id is not null;
