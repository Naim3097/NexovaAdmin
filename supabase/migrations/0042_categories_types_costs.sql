-- Job categories, the new task types, billing without milestones, project costs.
--
-- 1. team_members.category: what the app maps to task seats and duties
--    (closer | dm | creative | developer | am | business_support). `role`
--    stays as free text, the job title people read. Backfilled from the old
--    role names.
-- 2. Task types: "post" splits into "static" and "video" (titles that read
--    like a reel or video become video), "branding" folds into "custom"
--    (Other). Applied to works, planner lines, project and template
--    deliverable rows, and each member's hours per type.
-- 3. Seats: the SEO seat is gone; SEO work is the digital marketer's.
-- 4. Billing: projects bill monthly or once. "milestone" becomes "one_off";
--    contracts.milestones (migration 0041) is dropped.
-- 5. contracts.costs: costs other than people's time, rows of
--    { id, label, kind (ad_spend | freelancer | software | other), amountMyr, date, addedBy }.
-- Kuala Lumpur public holidays live in the app (src/lib/calendar/holidays.ts).

-- 1. job category
alter table public.team_members
    add column if not exists category text not null default '';
update public.team_members
set category = case
        when role ~* '(front|back|develop|engineer|infra)' then 'developer'
        when role ~* '(ui|ux|design|creative|video|motion)' then 'creative'
        when role ~* '(content|ads|seo|market)' then 'dm'
        when role ~* '(account|^pm$|project)' then 'am'
        when role ~* '(admin|support|finance)' then 'business_support'
        else 'closer'
    end
where category = '';
comment on column public.team_members.category is
    'Job category the app maps to seats and duties: closer | dm | creative | developer | am | business_support. role is the free-text job title.';

-- Helper: the new type for an old one.
create or replace function pg_temp.new_line_type(t text, title text)
returns text language sql immutable as $$
    select case
        when t = 'post' and coalesce(title, '') ~* '(reel|video|tiktok|short)' then 'video'
        when t = 'post' then 'static'
        when t = 'branding' then 'custom'
        else t
    end
$$;

-- Helper: a JSON array of rows with "type" (and "name"/"title") remapped.
create or replace function pg_temp.remap_rows(rows jsonb)
returns jsonb language sql immutable as $$
    select coalesce(jsonb_agg(
        case when r ? 'type'
             then jsonb_set(r, '{type}', to_jsonb(pg_temp.new_line_type(r->>'type', coalesce(r->>'title', r->>'name'))))
             else r end
        order by ord), '[]'::jsonb)
    from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) with ordinality as e(r, ord)
$$;

-- Helper: a split with the SEO seat moved to the digital marketer.
create or replace function pg_temp.remap_split(split jsonb)
returns jsonb language sql immutable as $$
    select coalesce(jsonb_agg(
        case when s->>'seat' = 'seo' then jsonb_set(s, '{seat}', '"dm"') else s end
        order by ord), '[]'::jsonb)
    from jsonb_array_elements(coalesce(split, '[]'::jsonb)) with ordinality as e(s, ord)
$$;

-- 2 + 3. tasks
update public.works
set type = pg_temp.new_line_type(type, title),
    split = pg_temp.remap_split(split)
where type in ('post', 'branding') or split::text like '%"seo"%';

update public.planners
set lines = pg_temp.remap_rows(lines)
where lines::text ~ '"type": ?"(post|branding)"';

update public.contracts
set requirements = pg_temp.remap_rows(requirements)
where requirements::text ~ '"type": ?"(post|branding)"';

update public.project_templates
set requirements = pg_temp.remap_rows(requirements)
where requirements::text ~ '"type": ?"(post|branding)"';

-- Crew: the SEO seat's person becomes the DM unless the project already names one.
update public.contracts
set crew = case
        when crew ? 'dm' then crew - 'seo'
        else (crew - 'seo') || jsonb_build_object('dm', crew->'seo')
    end
where crew ? 'seo';

-- Hours per type: post hours stand for statics and videos, branding for other work.
update public.team_members
set hours_by_type = (hours_by_type - 'post' - 'branding')
    || case when hours_by_type ? 'post' and not hours_by_type ? 'static' then jsonb_build_object('static', hours_by_type->'post') else '{}'::jsonb end
    || case when hours_by_type ? 'post' and not hours_by_type ? 'video' then jsonb_build_object('video', hours_by_type->'post') else '{}'::jsonb end
    || case when hours_by_type ? 'branding' and not hours_by_type ? 'custom' then jsonb_build_object('custom', hours_by_type->'branding') else '{}'::jsonb end
where hours_by_type ?| array['post', 'branding'];

-- 4. billing
update public.contracts
set billing = jsonb_set(billing, '{cadence}', '"one_off"')
where billing->>'cadence' = 'milestone';
alter table public.contracts
    drop column if exists milestones;

-- 5. project costs
alter table public.contracts
    add column if not exists costs jsonb not null default '[]'::jsonb;
comment on column public.contracts.costs is
    'Costs other than people''s time: [{ id, label, kind (ad_spend | freelancer | software | other), amountMyr, date, addedBy }]. Margin subtracts them.';
