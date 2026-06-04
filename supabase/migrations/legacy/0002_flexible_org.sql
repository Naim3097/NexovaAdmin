-- 0002_flexible_org.sql
-- Convert hard-coded role enum to data-driven roles + skills + teams.
-- Expand services to all 9 Nexova offerings + industries.
-- Add multi-provider payment + storage + AI fields.
-- Backwards-compatible: existing enum kept as legacy column, new tables seeded.

-- =========================================================================
-- ROLES  (replaces user_role enum as source of truth)
-- =========================================================================
create table public.roles (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,            -- 'ceo', 'closer', 'project_manager', ...
  name         text not null,
  description  text,
  scope        text not null default 'staff',   -- 'staff' | 'client'
  permissions  jsonb not null default '{}'::jsonb,
  is_system    boolean not null default false,  -- can't be deleted from UI
  created_at   timestamptz not null default now()
);

create table public.user_roles (
  user_id  uuid not null references public.users(id) on delete cascade,
  role_id  uuid not null references public.roles(id) on delete cascade,
  primary key (user_id, role_id)
);

-- =========================================================================
-- SKILLS  (for smart task routing — independent of role)
-- =========================================================================
create table public.skills (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,             -- 'web-dev', 'ui-design', 'copywriting', ...
  name        text not null,
  category    text,                             -- 'engineering' | 'design' | 'content' | 'marketing' | 'ops'
  created_at  timestamptz not null default now()
);

create table public.user_skills (
  user_id   uuid not null references public.users(id) on delete cascade,
  skill_id  uuid not null references public.skills(id) on delete cascade,
  level     int not null default 3 check (level between 1 and 5),
  primary key (user_id, skill_id)
);

-- =========================================================================
-- TEAMS  (optional grouping for scale)
-- =========================================================================
create table public.teams (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  name          text not null,
  lead_user_id  uuid references public.users(id),
  created_at    timestamptz not null default now()
);

create table public.team_members (
  team_id  uuid not null references public.teams(id) on delete cascade,
  user_id  uuid not null references public.users(id) on delete cascade,
  primary key (team_id, user_id)
);

-- =========================================================================
-- TASK ROUTING  (skill + team, in addition to direct assignee)
-- =========================================================================
alter table public.tasks
  add column required_skill_id  uuid references public.skills(id),
  add column team_id            uuid references public.teams(id);

create index on public.tasks (required_skill_id);
create index on public.tasks (team_id);

-- =========================================================================
-- INDUSTRIES  (verticals shown on portfolio)
-- =========================================================================
create table public.industries (
  id    uuid primary key default gen_random_uuid(),
  key   text not null unique,
  name  text not null
);

alter table public.clients
  add column industry_id  uuid references public.industries(id),
  add column country      text default 'MY',
  add column currency     text default 'MYR';

-- =========================================================================
-- EXPAND SERVICES — 9 actual Nexova offerings
-- old enum: ('website','ads','seo','app','marketing')
-- =========================================================================
alter type service_type add value if not exists 'social_media';
alter type service_type add value if not exists 'business_ops';
alter type service_type add value if not exists 'meta_ads';
alter type service_type add value if not exists 'google_ads';
alter type service_type add value if not exists 'brand';
alter type service_type add value if not exists 'gmb';
-- existing kept: website, app, seo, ads (legacy), marketing (legacy)

-- =========================================================================
-- MULTI-PROVIDER  (payments / storage / ai)
-- =========================================================================
alter table public.invoices
  add column payment_provider   text not null default 'lean',   -- 'lean' | 'stripe'
  add column lean_invoice_id    text,
  add column currency           text not null default 'MYR',
  add column payment_link       text;

alter table public.deals
  add column lean_payment_link  text,
  add column currency           text not null default 'MYR';

create table public.files (
  id                uuid primary key default gen_random_uuid(),
  entity_type       text not null,                 -- 'client' | 'project' | 'submission' | ...
  entity_id         uuid not null,
  storage_provider  text not null default 'supabase', -- 'supabase' | 'gdrive'
  path              text not null,                 -- bucket/key OR drive file id
  filename          text,
  mime_type         text,
  size_bytes        bigint,
  uploaded_by       uuid references public.users(id),
  created_at        timestamptz not null default now()
);
create index on public.files (entity_type, entity_id);

alter table public.content_pieces
  add column ai_provider  text default 'claude',   -- 'claude' | 'gemini'
  add column ai_model     text;

-- =========================================================================
-- SEEDS
-- =========================================================================

-- Roles (current 5 + room to grow)
insert into public.roles (key, name, scope, is_system, permissions) values
  ('ceo',             'CEO',             'staff', true,  '{"*": true}'::jsonb),
  ('closer',          'Closer',          'staff', true,  '{"leads.*": true, "deals.*": true, "clients.view": true}'::jsonb),
  ('frontend',        'Frontend Dev',    'staff', true,  '{"projects.view": true, "tasks.*": true}'::jsonb),
  ('backend',         'Backend Dev',     'staff', true,  '{"projects.view": true, "tasks.*": true}'::jsonb),
  ('uiux',            'UI/UX Designer',  'staff', true,  '{"projects.view": true, "tasks.*": true}'::jsonb),
  ('project_manager', 'Project Manager', 'staff', false, '{"projects.*": true, "tasks.*": true, "clients.view": true}'::jsonb),
  ('content',         'Content Writer',  'staff', false, '{"content.*": true, "tasks.view": true}'::jsonb),
  ('ads_specialist',  'Ads Specialist',  'staff', false, '{"ad_campaigns.*": true, "content.view": true}'::jsonb),
  ('seo_specialist',  'SEO Specialist',  'staff', false, '{"content.*": true, "projects.view": true}'::jsonb),
  ('contractor',      'Contractor',      'staff', false, '{"tasks.view_assigned": true}'::jsonb),
  ('client',          'Client',          'client', true, '{"portal.*": true}'::jsonb);

-- Skills
insert into public.skills (key, name, category) values
  ('web-dev',       'Web Development',     'engineering'),
  ('mobile-dev',    'Mobile Development',  'engineering'),
  ('backend-dev',   'Backend Development', 'engineering'),
  ('ui-design',     'UI Design',           'design'),
  ('ux-research',   'UX Research',         'design'),
  ('brand-design',  'Brand & Identity',    'design'),
  ('copywriting',   'Copywriting',         'content'),
  ('seo-writing',   'SEO Writing',         'content'),
  ('video-edit',    'Video Editing',       'content'),
  ('ads-meta',      'Meta Ads',            'marketing'),
  ('ads-google',    'Google Ads',          'marketing'),
  ('seo-tech',      'Technical SEO',       'marketing'),
  ('gmb',           'Google My Business',  'marketing'),
  ('social-media',  'Social Media Mgmt',   'marketing'),
  ('sales',         'Sales / Closing',     'ops'),
  ('project-mgmt',  'Project Management',  'ops');

-- Teams (start with a couple — add more as you grow)
insert into public.teams (key, name) values
  ('web',     'Web Team'),
  ('ads',     'Ads Team'),
  ('content', 'Content Team'),
  ('design',  'Design Team');

-- Industries (from portfolio verticals)
insert into public.industries (key, name) values
  ('tech_fintech',   'Technology / IT / Fintech'),
  ('automotive',     'Automotive'),
  ('food_fmcg',      'Food / FMCG'),
  ('tourism',        'Tourism / Hospitality'),
  ('retail_fashion', 'Retail / Fashion'),
  ('social_impact',  'Social Impact');

-- Services (9 offerings)
insert into public.services (name, type, base_price) values
  ('Social Media Management',  'social_media', null),
  ('Business Operation System','business_ops', null),
  ('META Ads',                 'meta_ads',     null),
  ('Google Ads',               'google_ads',   null),
  ('Website Creation',         'website',      null),
  ('App Development',          'app',          null),
  ('Brand Development & Kit',  'brand',        null),
  ('Google SEO',               'seo',          null),
  ('Google My Business',       'gmb',          null);

-- =========================================================================
-- HELPER: has_permission(user, key)
-- =========================================================================
create or replace function public.user_has_permission(uid uuid, perm text)
returns boolean language sql stable as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = uid
      and (
        r.permissions ? '*'
        or r.permissions ? perm
        or r.permissions ? (split_part(perm, '.', 1) || '.*')
      )
  );
$$;

-- =========================================================================
-- RLS for new tables
-- =========================================================================
alter table public.roles         enable row level security;
alter table public.user_roles    enable row level security;
alter table public.skills        enable row level security;
alter table public.user_skills   enable row level security;
alter table public.teams         enable row level security;
alter table public.team_members  enable row level security;
alter table public.industries    enable row level security;
alter table public.files         enable row level security;
