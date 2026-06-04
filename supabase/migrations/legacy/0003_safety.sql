-- 0003_safety.sql
-- Cross-cutting safety: soft deletes, audit trail, webhooks, AI cache,
-- notifications, FX rates, tax, consent, PWA-friendly extras.
-- All additive. Safe to apply on top of 0001 + 0002.

-- =========================================================================
-- SOFT DELETE  (add deleted_at to recoverable entities)
-- =========================================================================
alter table public.users          add column deleted_at timestamptz;
alter table public.leads          add column deleted_at timestamptz;
alter table public.clients        add column deleted_at timestamptz;
alter table public.deals          add column deleted_at timestamptz;
alter table public.projects       add column deleted_at timestamptz;
alter table public.tasks          add column deleted_at timestamptz;
alter table public.invoices       add column deleted_at timestamptz;
alter table public.content_pieces add column deleted_at timestamptz;

create index on public.leads          (deleted_at) where deleted_at is null;
create index on public.clients        (deleted_at) where deleted_at is null;
create index on public.deals          (deleted_at) where deleted_at is null;
create index on public.projects       (deleted_at) where deleted_at is null;
create index on public.tasks          (deleted_at) where deleted_at is null;
create index on public.invoices       (deleted_at) where deleted_at is null;

-- Optional convenience views (active rows only)
create or replace view public.v_leads_active    as select * from public.leads    where deleted_at is null;
create or replace view public.v_clients_active  as select * from public.clients  where deleted_at is null;
create or replace view public.v_deals_active    as select * from public.deals    where deleted_at is null;
create or replace view public.v_projects_active as select * from public.projects where deleted_at is null;
create or replace view public.v_tasks_active    as select * from public.tasks    where deleted_at is null;
create or replace view public.v_invoices_active as select * from public.invoices where deleted_at is null;

-- =========================================================================
-- ROW-LEVEL AUDIT TRAIL
-- =========================================================================
create table public.audit_log (
  id           bigserial primary key,
  table_name   text not null,
  row_id       uuid not null,
  op           text not null check (op in ('INSERT','UPDATE','DELETE')),
  actor_id     uuid,
  old_row      jsonb,
  new_row      jsonb,
  changed      jsonb,
  created_at   timestamptz not null default now()
);
create index on public.audit_log (table_name, row_id);
create index on public.audit_log (created_at desc);

create or replace function public.fn_audit_row()
returns trigger language plpgsql security definer as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_diff jsonb := '{}'::jsonb;
  v_actor uuid;
  k text;
begin
  begin
    v_actor := auth.uid();
  exception when others then
    v_actor := null;
  end;

  if (tg_op = 'INSERT') then
    v_new := to_jsonb(new);
    insert into public.audit_log(table_name,row_id,op,actor_id,new_row)
      values (tg_table_name, new.id, 'INSERT', v_actor, v_new);
    return new;
  elsif (tg_op = 'UPDATE') then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    for k in select jsonb_object_keys(v_new) loop
      if v_old->k is distinct from v_new->k then
        v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('old', v_old->k, 'new', v_new->k));
      end if;
    end loop;
    if v_diff <> '{}'::jsonb then
      insert into public.audit_log(table_name,row_id,op,actor_id,old_row,new_row,changed)
        values (tg_table_name, new.id, 'UPDATE', v_actor, v_old, v_new, v_diff);
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    v_old := to_jsonb(old);
    insert into public.audit_log(table_name,row_id,op,actor_id,old_row)
      values (tg_table_name, old.id, 'DELETE', v_actor, v_old);
    return old;
  end if;
  return null;
end $$;

-- Attach to money + sensitive tables
create trigger trg_audit_deals      after insert or update or delete on public.deals
  for each row execute function public.fn_audit_row();
create trigger trg_audit_invoices   after insert or update or delete on public.invoices
  for each row execute function public.fn_audit_row();
create trigger trg_audit_clients    after insert or update or delete on public.clients
  for each row execute function public.fn_audit_row();
create trigger trg_audit_users      after insert or update or delete on public.users
  for each row execute function public.fn_audit_row();
create trigger trg_audit_user_roles after insert or update or delete on public.user_roles
  for each row execute function public.fn_audit_row();
create trigger trg_audit_roles      after insert or update or delete on public.roles
  for each row execute function public.fn_audit_row();

-- =========================================================================
-- PDPA — CONSENT
-- =========================================================================
alter table public.clients add column data_consent jsonb default '{}'::jsonb;
alter table public.clients add column consent_at   timestamptz;
alter table public.leads   add column data_consent jsonb default '{}'::jsonb;
alter table public.leads   add column consent_at   timestamptz;

-- Data subject requests (export / delete)
create table public.data_subject_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users(id),
  email         text,
  type          text not null check (type in ('export','delete')),
  status        text not null default 'pending' check (status in ('pending','processing','complete','rejected')),
  requested_at  timestamptz not null default now(),
  fulfilled_at  timestamptz,
  artifact_url  text
);

-- =========================================================================
-- WEBHOOKS (inbound, idempotent, signature-verified by app)
-- =========================================================================
create table public.webhook_events (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,         -- 'lean','stripe','meta','google','calcom'
  event_id      text not null,         -- provider's id
  event_type    text not null,
  signature_ok  boolean not null,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text,
  unique (provider, event_id)
);
create index on public.webhook_events (provider, event_type);
create index on public.webhook_events (processed_at) where processed_at is null;

-- =========================================================================
-- AI REQUEST LOG + CACHE
-- =========================================================================
create table public.ai_requests (
  id             uuid primary key default gen_random_uuid(),
  prompt_hash    text not null,
  provider       text not null,        -- 'claude' | 'gemini'
  model          text not null,
  workflow       text,                 -- 'onboarding_form_gen', 'lead_score', ...
  prompt         text,
  response       text,
  tokens_in      int,
  tokens_out     int,
  cost_usd       numeric(10,6),
  cached         boolean not null default false,
  user_id        uuid references public.users(id),
  entity_type    text,
  entity_id      uuid,
  created_at     timestamptz not null default now()
);
create index on public.ai_requests (prompt_hash, created_at desc);
create index on public.ai_requests (workflow, created_at desc);

-- =========================================================================
-- NOTIFICATIONS
-- =========================================================================
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null,           -- 'lead.assigned', 'deal.paid', 'form.submitted', ...
  title       text not null,
  body        text,
  entity_type text,
  entity_id   uuid,
  url         text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.notifications (user_id, read_at, created_at desc);

create table public.notification_preferences (
  user_id    uuid not null references public.users(id) on delete cascade,
  event_type text not null,            -- matches notifications.type
  channel    text not null,            -- 'in_app' | 'email' | 'telegram'
  enabled    boolean not null default true,
  primary key (user_id, event_type, channel)
);

-- =========================================================================
-- FX RATES & TAX
-- =========================================================================
create table public.fx_rates (
  id           uuid primary key default gen_random_uuid(),
  from_ccy     text not null,
  to_ccy       text not null,
  rate         numeric(18,8) not null,
  source       text,
  captured_at  timestamptz not null default now(),
  unique (from_ccy, to_ccy, captured_at)
);
create index on public.fx_rates (from_ccy, to_ccy, captured_at desc);

alter table public.invoices add column tax_rate    numeric(5,4) default 0;       -- 0.06 = 6%
alter table public.invoices add column tax_amount  numeric(12,2) default 0;
alter table public.invoices add column fx_rate     numeric(18,8);                -- snapshot at issue
alter table public.invoices add column fx_to_myr   numeric(12,2);                -- equivalent in MYR for reporting

alter table public.deals    add column fx_rate     numeric(18,8);
alter table public.deals    add column fx_to_myr   numeric(12,2);

-- =========================================================================
-- USER PREFS (timezone, locale)
-- =========================================================================
alter table public.users add column timezone text default 'Asia/Kuala_Lumpur';
alter table public.users add column locale   text default 'en';
alter table public.users add column tfa_enabled boolean not null default false;
alter table public.users add column deactivated_at timestamptz;

-- =========================================================================
-- RATE LIMIT (simple counter; production may use Upstash/Redis)
-- =========================================================================
create table public.rate_limit_buckets (
  key         text not null,           -- 'ip:1.2.3.4:leads' etc.
  window_start timestamptz not null,
  count       int not null default 0,
  primary key (key, window_start)
);

-- =========================================================================
-- RLS for new tables
-- =========================================================================
alter table public.audit_log              enable row level security;
alter table public.data_subject_requests  enable row level security;
alter table public.webhook_events         enable row level security;
alter table public.ai_requests            enable row level security;
alter table public.notifications          enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.fx_rates               enable row level security;
alter table public.rate_limit_buckets     enable row level security;
