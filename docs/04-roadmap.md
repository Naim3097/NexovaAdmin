# 04 — Build Roadmap

> Every phase has **NFR gates** — see [`06-non-functional-requirements.md`](./06-non-functional-requirements.md). PRs failing gates don't merge.

## Week 0 — Pre-Build Setup (do these BEFORE writing app code)
- [ ] Supabase **Pro** project (PITR enabled), region Singapore
- [ ] 3 Supabase projects: `local` (CLI), `staging`, `production`
- [ ] DNS for `nexovadmin.com` + `nexovadigital.com`: A/CNAME to Vercel, SPF + DKIM + DMARC for Resend (verify via mail-tester.com → 10/10)
- [ ] Sentry project (Next.js + n8n)
- [ ] BetterStack uptime monitors
- [ ] PostHog project
- [ ] Cloudflare account (Turnstile site keys)
- [ ] GitHub repo + branch protection (PR review required, CI green required)
- [ ] `.env.example` committed; secrets in Vercel/Railway only
- [ ] Apply migrations 0001 + 0002 + 0003 to staging, verify, then production
- [ ] Backup automation: nightly `pg_dump` n8n workflow → Google Drive (30d retention)

## Week 1 — Foundation
- [ ] Scaffold Next.js 15 (TypeScript strict, Tailwind, shadcn/ui, next-pwa, next-intl)
- [ ] Supabase Auth: magic link + 2FA-required for staff roles
- [ ] `user_has_permission()` based middleware (no hardcoded role checks anywhere)
- [ ] RLS policies for all tables; CI script asserting every table has RLS enabled
- [ ] Soft-delete query helpers (default scope excludes `deleted_at is not null`)
- [ ] Sentry + PostHog wired in app + n8n
- [ ] Health endpoint `/api/health` for BetterStack
- [ ] Mobile shell: responsive sidebar → bottom-nav, base layout, dark/light
- [ ] Deploy n8n on Railway, link to staging Supabase first
- [ ] Telegram bot ping test
- **NFR gates:** §1.1 backups · §1.2 soft delete · §2.1 auth · §2.2 RLS · §5.1 Sentry · §5.2 uptime · §6.1 DNS · §9.1 currency

## Week 2 — Onboarding Wedge (P0)
- [ ] Onboarding template seed (Website Creation — from existing checklist)
- [ ] Client portal page `/portal/onboarding/[formId]` (mobile-first, Lighthouse ≥ 90)
- [ ] Form renderer from `schema_json` (text, textarea, file, multi-select, color picker)
- [ ] Supabase Storage **private** buckets + signed URLs; file-type allowlist; max 50MB
- [ ] Camera-capture for image fields on mobile
- [ ] Cloudflare Turnstile on portal entry + rate limit
- [ ] Auto-save + completion %
- [ ] PDPA consent checkbox → `data_consent` jsonb + `consent_at`
- [ ] n8n workflow: `project.created` → Claude generates customised form (logged to `ai_requests`) → email portal link via Resend
- [ ] n8n workflow: `form.submitted` → Claude summarises → creates tasks (with `required_skill_id`) → in-app + Telegram notification
- **NFR gates:** §2.3 file security · §2.4 form protection · §3.1 consent · §4.1 mobile · §8.1 AI cost log

## Week 3 — Sales Pipeline
- [ ] Public marketing site (or use existing nexovadigital.com) — lead form → webhook → Supabase
- [ ] Cal.com embed for booking; webhook → `webhook_events` → update lead
- [ ] AI lead scoring (Gemini for cost) → `leads.ai_score`
- [ ] Closer dashboard: pipeline kanban (mobile = vertical scroll)
- [ ] Contract template (PDF from HTML)
- [ ] **Lean.x** payment-link generator (primary); Stripe fallback for intl
- [ ] Lean + Stripe inbound webhooks: signature verify → `webhook_events` → promote lead → create project → trigger onboarding
- **NFR gates:** §1.3 audit on deals · §2.5 webhook signatures · §8.2 AI guardrails · §6.2 notifications

## Week 4 — Delivery + CEO Dashboard
- [ ] Project / phase / task views (kanban + list, mobile cards)
- [ ] Activity log + audit log UI per entity
- [ ] CEO dashboard: leads this week, deals MTD, active projects, ad ROAS, MRR (MYR + USD-equivalent via fx_rates)
- [ ] Daily digest email (n8n cron) + Telegram morning summary
- [ ] Deactivate-user flow (auto-reassign open work)
- **NFR gates:** §4.1 mobile (CEO) · §7.1 perf · §5.4 PostHog

## Week 5–6 — Ads + Content Engines
- [ ] In-house ads workflow (request → AI draft → approval → Meta/Google API push)
- [ ] Hourly sync: campaign metrics → `ad_campaigns` table
- [ ] Lead source attribution → ROAS
- [ ] SEO article generator (Claude draft → forbidden-phrase check → editor review → publish)
- [ ] Content review queue UI
- **NFR gates:** §8.1/8.2 enforced for all AI calls · §1.3 audit on content_pieces

## Week 7+ — Polish & Expand
- [ ] Invoice automation (auto-create on milestones, Lean/Stripe send, dunning, SST tax, FX snapshot)
- [ ] Client portal v2: project status, draft approvals, invoice payment, **Export my data** + **Delete my account**
- [ ] Weekly client report PDF (auto-email)
- [ ] Internal Q&A bot over company SOPs
- [ ] PWA install prompt + offline shell verified
- [ ] Quarterly DR drill: restore staging from prod backup
- **NFR gates:** §9.2 FX · §9.3 tax · §1.3 audit on invoices · §3.2 data subject rights
