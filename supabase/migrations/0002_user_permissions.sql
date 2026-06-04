-- 0002_user_permissions.sql
-- Permissive `user_has_permission(uid uuid, perm text)` function used by
-- src/lib/auth.ts. Single-CEO tenant: any authenticated user is granted all
-- permissions. Tighten when a real role/permission system lands.
--
-- Idempotent.

create or replace function public.user_has_permission(uid uuid, perm text)
returns boolean
language sql
stable
security definer
as $$
    select uid is not null;
$$;

revoke all on function public.user_has_permission(uuid, text) from public;
grant execute on function public.user_has_permission(uuid, text)
    to anon, authenticated, service_role;
