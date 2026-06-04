# Nexov Admin — Internal Operations System

**Domain:** nexovadmin.com
**Owner:** Nexov (Digital Marketing Agency: Websites, Ads, SEO, Apps)
**Team:** CEO, Closer, Frontend, Backend, UI/UX (5 people)
**Status:** Planning → Build (Week 1)

---

## What This Is

A self-hosted, AI-augmented internal platform that runs the entire agency:
- Capture leads → close deals → onboard clients → deliver projects → run ads → report.
- Single source of truth for clients, projects, campaigns, content, invoices.
- CEO dashboard, team kanban, and client portal — all one app.

## Tech Stack

| Layer | Tool |
|---|---|
| Database / Auth / Storage | **Supabase** (Postgres) — self-hostable later |
| Web app (admin + client portal) | **Next.js 15** + TypeScript + shadcn/ui + Tailwind |
| Automation engine | **n8n** (self-hosted on Railway, ~$5/mo) |
| AI | **Claude API** (Anthropic) + OpenAI (embeddings) |
| Email | **Resend** |
| Payments | **Stripe** |
| Booking | **Cal.com** (embed) |
| Team alerts | **Telegram Bot** |
| Ads APIs | Meta Ads, Google Ads, TikTok Ads |
| Hosting | Vercel (app) + Railway (n8n) + Supabase Cloud (DB) |

**Estimated monthly cost (MVP):** ~$15–30

## Repo Structure

```
nexovadmin/
├── app/                  # Next.js application (admin + portal + public site)
├── supabase/
│   ├── migrations/       # SQL schema migrations
│   └── seed.sql
├── n8n/
│   └── workflows/        # Exported n8n workflow JSON
├── docs/
│   ├── 01-master-plan.md
│   ├── 02-data-model.md
│   ├── 03-workflows-overview.md
│   ├── 04-roadmap.md
│   ├── 05-tech-decisions.md
│   ├── workflows/        # One file per workflow spec
│   └── onboarding-checklists/  # Per-service client info checklists
└── .vscode/
```

## Quick Links

- [Master Plan](docs/01-master-plan.md)
- [Data Model](docs/02-data-model.md)
- [Workflows Overview](docs/03-workflows-overview.md)
- [Roadmap](docs/04-roadmap.md)
- [Tech Decisions](docs/05-tech-decisions.md)
- [Website Onboarding Checklist](docs/onboarding-checklists/website-creation.md)

## Next Action

Week 1 — Foundation. See [Roadmap](docs/04-roadmap.md).
