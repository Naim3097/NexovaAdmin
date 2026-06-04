# 01 — Master Plan

## Business Context

- **Company:** Nexova — full-service digital agency
- **Country / currency:** Malaysia / MYR (MYR primary, USD secondary for intl clients)
- **Public site:** nexovadigital.com  · **Internal tool:** nexovadmin.com
- **Services (9):** Website Creation, App Development, Social Media Management, META Ads, Google Ads, Google SEO, Google My Business, Brand Development & Kit, **Business Operation System**
- **Industries served:** Tech/IT/Fintech, Automotive, Food/FMCG, Tourism/Hospitality, Retail/Fashion, Social Impact
- **Team:** starts with 5 (CEO, Closer, Frontend, Backend, UI/UX) — system designed to scale to 20+ via flexible roles/skills/teams (no schema changes to add people or specialisms)
- **Active clients:** ~5–7 active (12+ total in portfolio incl. past projects: Lean.x, Enfrasys, AceTeam, Payright, OneX, JV Auto Lube, Buana Kita, Kalima, FTECH, BYKI, Tropicor, The Temenggor, Katimas)
- **Current tools:** Google Workspace, Meta Ads, Google/TikTok Ads
- **Build approach:** Self-hosted, owned data (Supabase + n8n)
- **AI usage:** Onboarding info collection, ad creative drafts, email drafts, SEO articles, lead scoring
- **Priority workflow #1:** **Onboarding / client info collection** (the wedge)

> **Note:** "Business Operation System" is also one of Nexova's 9 paid services. The internal tool we build here is the foundation of that product line. v1 is single-tenant (Nexova-only); the schema is structured so multi-tenant resale is possible later without rewrites.

## Pain Points (all confirmed)

1. Leads slip through cracks
2. Manual data entry between tools
3. No single source of truth for clients/projects
4. Onboarding slow & inconsistent
5. Hard to track ad spend → revenue
6. Team unclear on what's next
7. Manual client reporting
8. Content creation bottleneck
9. Invoicing / payment chasing
10. CEO has no real-time visibility

## Success Criteria for v1

- Every lead enters one system; never lost.
- Closer has a pipeline view + auto-generated contracts + Lean.x payment links (Stripe for intl).
- Once a deal is paid, an onboarding form is auto-generated and sent to the client portal.
- Client fills the form via portal; AI summarizes into a brief; tasks auto-created for FE/BE/UIUX.
- CEO sees one dashboard: leads this week, deals closed, active projects, ad ROAS, MRR.
- All data lives in Supabase (we own it).
- **Mobile-first** — Lighthouse mobile ≥ 90 on portal form, closer pipeline, CEO dashboard, task list.
- **Safe by default** — backups + PITR, soft deletes, row-level audit on money, RLS on every table, signed URLs for files, 2FA on staff accounts, PDPA-compliant (consent + export + delete).
- **Observable** — Sentry errors, BetterStack uptime, PostHog product analytics, AI cost tracked per workflow.

> Full cross-cutting requirements + per-phase gates live in [`06-non-functional-requirements.md`](./06-non-functional-requirements.md). Build order in [`04-roadmap.md`](./04-roadmap.md).

## Guiding Principles

1. **One app, role-based views** — same Next.js codebase serves CEO, team, and clients.
2. **Database first** — every action writes to Postgres; UIs and automations read from it.
3. **n8n is the glue** — webhooks, cron, AI calls, third-party APIs.
4. **AI drafts, humans approve** — never auto-publish to clients without review.
5. **Activity log everywhere** — every status change recorded for audit + CEO visibility.
