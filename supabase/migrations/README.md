# Migrations

Active schema lives in this directory. Apply in numeric order with `supabase db push` or `supabase db reset`.

## Active

- `0001_init.sql` — consolidated schema matching the current app dev-store shape exactly. 13 tables (agency_profile, services, clients, team_members, leads, projects, invoices, invoice_items, campaigns, campaign_metrics, content_posts, seo_articles, onboarding_submissions, notifications, audit_events). RLS enabled with permissive `authenticated` policies (single-tenant for now).

## Legacy (`legacy/`)

Earlier exploratory migrations (`0001_init` through `0004_rls_check`) written during planning but never applied to a real Supabase project. Preserved for design history. **Do not apply.** They split entities differently (separate `clients`/`deals`/`project_phases`/`tasks` tables) and pre-date the additive concepts the app actually built (audit log, notifications, project portal token, lead score, campaign fee model).
