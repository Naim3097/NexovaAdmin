-- 0006_content_plans.sql
-- Phase 1 of the Axtra content-review rebuild: make per-client content plans
-- DATA-DRIVEN (replaces Axtra's hardcoded CLIENT_CONFIG deliverable lists).
--
-- Adds:
--   clients.content_revision_limit  — capped feedback cycles, per client (Axtra hardcoded 3)
--   clients.monthly_content_quota   — how many content items the retainer covers per month
--   clients.portal_token            — client-level portal token (one link shows all their content)
--   content_posts.plan_month        — 'YYYY-MM'; which monthly plan a post belongs to ('' = ad-hoc)
--   content_posts.origin            — 'plan' (retainer deliverable) | 'request' (one-off client ask)
--
-- See docs/axtra-content-review-integration.md. Applied manually via the Supabase
-- SQL editor per repo convention. (If 0006_quotations also lands, the two files
-- touch different objects and apply independently — rename only on a real clash.)

-- -----------------------------------------------------------------------------
-- CLIENTS — per-client content config
-- -----------------------------------------------------------------------------
alter table public.clients
    add column if not exists content_revision_limit int  not null default 3,
    add column if not exists monthly_content_quota  int  not null default 0,
    add column if not exists portal_token           text not null default '';

-- Portal token unique when present (empty allowed) — mirrors projects_portal_token_idx.
create unique index if not exists clients_portal_token_idx
    on public.clients (portal_token)
    where portal_token <> '';

-- -----------------------------------------------------------------------------
-- CONTENT_POSTS — tie a post to a monthly plan and record its origin
-- -----------------------------------------------------------------------------
alter table public.content_posts
    add column if not exists plan_month text not null default '',
    add column if not exists origin     text not null default 'plan'
        check (origin in ('plan','request'));

create index if not exists content_posts_plan_month_idx
    on public.content_posts (client_name, plan_month);
