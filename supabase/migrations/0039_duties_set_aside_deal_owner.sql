-- Roles rework, hours set aside, deal owner, no briefing.
--
-- 1. team_members.functions: duties are now 'delivery' | 'finance'. The old
--    account_manager and sales duties were delivery people; being an account
--    manager or deal owner follows from projects and clients instead.
-- 2. team_members.set_aside: labelled rows [{ label, hours }] of hours a week
--    set aside for non-delivery work, replacing the reserved_hours record.
-- 3. clients.deal_owner: who closed the deal (was account_manager; projects
--    keep their own account manager).
-- 4. works.requested_at: the "brief team" step is gone; tasks are visible to
--    their owners as soon as they exist.

-- 1. duties
update public.team_members
set functions = (
    select coalesce(array_agg(distinct f), '{}')
    from unnest(functions) as raw(f0)
    cross join lateral (
        select case when raw.f0 in ('account_manager', 'sales', 'delivery') then 'delivery'
                    when raw.f0 = 'finance' then 'finance' end as f
    ) m
    where m.f is not null
);

-- 2. hours set aside
alter table public.team_members
    add column if not exists set_aside jsonb not null default '[]'::jsonb;
update public.team_members
set set_aside = coalesce((
    select jsonb_agg(jsonb_build_object(
        'label', case key when 'management' then 'Management'
                          when 'account_manager' then 'Account management'
                          when 'sales' then 'Sales'
                          when 'finance' then 'Contracts & invoicing'
                          else key end,
        'hours', value::numeric))
    from jsonb_each_text(reserved_hours)
    where value::numeric > 0
), '[]'::jsonb)
where reserved_hours is not null and jsonb_typeof(reserved_hours) = 'object';
alter table public.team_members drop column if exists reserved_hours;
comment on column public.team_members.set_aside is
    'Hours a week set aside for non-delivery work: [{ label, hours }]. Delivery capacity = weekly_hours - these.';

-- 3. deal owner
alter table public.clients rename column account_manager to deal_owner;
comment on column public.clients.deal_owner is
    'Team member who closed the deal. Projects carry their own account manager.';

-- 4. no briefing step
alter table public.works drop column if exists requested_at;
