-- 0001_init.sql
-- Nexov Admin — initial schema
-- Apply with: supabase db push   (after `supabase init` and link)

-- =========================================================================
-- ENUMS
-- =========================================================================
create type user_role            as enum ('ceo','closer','frontend','backend','uiux','client');
create type service_type         as enum ('website','ads','seo','app','marketing');
create type lead_status          as enum ('new','contacted','qualified','consult_booked','won','lost');
create type client_status        as enum ('onboarding','active','paused','churned');
create type deal_stage           as enum ('proposal','contract_sent','signed','paid','lost');
create type project_status       as enum ('onboarding','in_progress','qa','amendments','launched','handover','complete');
create type phase_status         as enum ('not_started','in_progress','blocked','done');
create type task_status          as enum ('todo','doing','review','done');
create type form_status          as enum ('draft','sent','in_progress','submitted','processed');
create type ad_platform          as enum ('meta','google','tiktok');
create type campaign_status      as enum ('draft','pending_approval','running','paused','complete');
create type content_type         as enum ('ad_copy','ad_image_brief','seo_article','email','social_post');
create type content_status       as enum ('ai_draft','human_review','approved','published');
create type invoice_status       as enum ('draft','sent','paid','overdue','void');

-- =========================================================================
-- USERS  (extends auth.users)
-- =========================================================================
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role not null default 'client',
  name        text not null,
  email       text not null unique,
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- =========================================================================
-- SERVICES
-- =========================================================================
create table public.services (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  type                     service_type not null,
  base_price               numeric(12,2),
  default_duration_days    int,
  onboarding_template_id   uuid,
  created_at               timestamptz not null default now()
);

-- =========================================================================
-- ONBOARDING TEMPLATES
-- =========================================================================
create table public.onboarding_templates (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid references public.services(id) on delete cascade,
  name        text not null,
  schema_json jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.services
  add constraint services_onboarding_template_fk
  foreign key (onboarding_template_id) references public.onboarding_templates(id);

-- =========================================================================
-- LEADS
-- =========================================================================
create table public.leads (
  id                uuid primary key default gen_random_uuid(),
  source            text,
  campaign_id       uuid,
  name              text not null,
  email             text,
  phone             text,
  service_interest  uuid references public.services(id),
  status            lead_status not null default 'new',
  ai_score          int check (ai_score between 1 and 10),
  assigned_to       uuid references public.users(id),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.leads (status);
create index on public.leads (assigned_to);

-- =========================================================================
-- CLIENTS
-- =========================================================================
create table public.clients (
  id                       uuid primary key default gen_random_uuid(),
  lead_id                  uuid references public.leads(id),
  company_name             text not null,
  primary_contact_user_id  uuid references public.users(id),
  status                   client_status not null default 'onboarding',
  created_at               timestamptz not null default now()
);

-- =========================================================================
-- DEALS
-- =========================================================================
create table public.deals (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid references public.leads(id),
  client_id            uuid references public.clients(id),
  service_id           uuid references public.services(id),
  value                numeric(12,2) not null,
  stage                deal_stage not null default 'proposal',
  contract_url         text,
  stripe_payment_link  text,
  paid_at              timestamptz,
  created_at           timestamptz not null default now()
);

-- =========================================================================
-- PROJECTS
-- =========================================================================
create table public.projects (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id),
  deal_id           uuid references public.deals(id),
  service_id        uuid references public.services(id),
  status            project_status not null default 'onboarding',
  current_phase_id  uuid,
  start_date        date,
  due_date          date,
  brief_md          text,
  created_at        timestamptz not null default now()
);

create table public.project_phases (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null,
  "order"     int not null,
  status      phase_status not null default 'not_started',
  owner_id    uuid references public.users(id),
  due         date,
  created_at  timestamptz not null default now()
);

alter table public.projects
  add constraint projects_current_phase_fk
  foreign key (current_phase_id) references public.project_phases(id);

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  phase_id      uuid references public.project_phases(id) on delete set null,
  title         text not null,
  description   text,
  assignee_id   uuid references public.users(id),
  status        task_status not null default 'todo',
  due           date,
  ai_generated  boolean not null default false,
  created_at    timestamptz not null default now()
);

-- =========================================================================
-- ONBOARDING FORMS
-- =========================================================================
create table public.onboarding_forms (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  template_id     uuid references public.onboarding_templates(id),
  schema_json     jsonb not null,
  status          form_status not null default 'draft',
  sent_at         timestamptz,
  submitted_at    timestamptz,
  completion_pct  int not null default 0
);

create table public.onboarding_submissions (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid not null references public.onboarding_forms(id) on delete cascade,
  field_key   text not null,
  value_text  text,
  value_json  jsonb,
  file_url    text,
  updated_at  timestamptz not null default now(),
  unique (form_id, field_key)
);

-- =========================================================================
-- AD CAMPAIGNS
-- =========================================================================
create table public.ad_campaigns (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid references public.clients(id),  -- null = in-house
  platform             ad_platform not null,
  objective            text,
  budget               numeric(12,2),
  status               campaign_status not null default 'draft',
  external_id          text,
  spend                numeric(12,2) default 0,
  impressions          bigint default 0,
  leads_generated      int default 0,
  revenue_attributed   numeric(12,2) default 0,
  created_at           timestamptz not null default now()
);

alter table public.leads
  add constraint leads_campaign_fk
  foreign key (campaign_id) references public.ad_campaigns(id);

-- =========================================================================
-- CONTENT
-- =========================================================================
create table public.content_pieces (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid references public.ad_campaigns(id),
  project_id    uuid references public.projects(id),
  type          content_type not null,
  status        content_status not null default 'ai_draft',
  ai_draft      text,
  final_version text,
  author_id     uuid references public.users(id),
  approved_by   uuid references public.users(id),
  created_at    timestamptz not null default now()
);

-- =========================================================================
-- INVOICES
-- =========================================================================
create table public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients(id),
  project_id          uuid references public.projects(id),
  amount              numeric(12,2) not null,
  status              invoice_status not null default 'draft',
  stripe_invoice_id   text,
  due_date            date,
  paid_at             timestamptz,
  created_at          timestamptz not null default now()
);

-- =========================================================================
-- ACTIVITY LOG
-- =========================================================================
create table public.activity_log (
  id           bigserial primary key,
  entity_type  text not null,
  entity_id    uuid not null,
  actor_id     uuid references public.users(id),
  action       text not null,
  payload      jsonb,
  created_at   timestamptz not null default now()
);
create index on public.activity_log (entity_type, entity_id);

-- =========================================================================
-- ROW-LEVEL SECURITY  (skeleton — refine per role in 0003_rls.sql)
-- =========================================================================
alter table public.users                  enable row level security;
alter table public.leads                  enable row level security;
alter table public.clients                enable row level security;
alter table public.deals                  enable row level security;
alter table public.projects               enable row level security;
alter table public.project_phases         enable row level security;
alter table public.tasks                  enable row level security;
alter table public.onboarding_forms       enable row level security;
alter table public.onboarding_submissions enable row level security;
alter table public.ad_campaigns           enable row level security;
alter table public.content_pieces         enable row level security;
alter table public.invoices               enable row level security;
alter table public.activity_log           enable row level security;
