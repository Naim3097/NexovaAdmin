# 05 — Tech Decisions

## Stack & Why

| Choice | Alternative | Why we picked it |
|---|---|---|
| **Supabase** (Postgres) | Firebase, Airtable | Real SQL, RLS for portal security, free tier huge, auth + storage included, can self-host later |
| **Next.js 15** (App Router) | Remix, SvelteKit | Largest ecosystem; Vercel deploy in 1 click; React Server Components reduce client JS |
| **shadcn/ui + Tailwind** | MUI, Chakra | Copy-paste components we own; no lock-in; matches modern aesthetic |
| **n8n self-hosted** | Zapier, Make | Unlimited runs at flat ~$5/mo; AI nodes built in; we own workflow data |
| **Claude API** (primary AI) | OpenAI | Best for client-facing long-form: briefs, emails, SEO articles |
| **Gemini API** (secondary AI) | OpenAI | Cheap bulk tasks: lead scoring, summarization, image/ad analysis; huge context window; generous free tier |
| **Resend** | SendGrid, SES | Dev-friendly, React Email templates, cheap |
| **Lean.x** (primary payments) | — | Local MENA/UAE rails (AED, bank-to-bank), lower FX friction for regional clients |
| **Stripe** (secondary payments) | PayPal, Razorpay | International cards / global clients; subscriptions + payment links |
| **Cal.com** | Calendly | Embeddable, self-hostable, no per-seat cost |
| **Telegram Bot** | Slack | Free, instant, team already on phones |
| **Railway** (n8n) | Hetzner VPS | Less ops; ~$5/mo; PR previews |
| **Vercel** (Next.js hosting) | Self-host | Confirmed. Free tier; previews on every commit; 1-click deploy |
| **Supabase Storage** (primary) | Cloudflare R2 | Keeps stack tight; same auth + RLS as DB; good for client uploads, contracts, brand assets |
| **Google Firestore / Drive** (optional) | — | Fallback for large media or if a client already lives in Google Workspace |
| **next-pwa** | Native apps | Installable, offline shell, push-ready — covers 95% of mobile needs without app stores |
| **next-intl** | i18next | English only now, scaffolded so adding Bahasa Malaysia / Mandarin later = translate one file |
| **Sentry** (free tier) | Bugsnag | Error monitoring on Next.js + n8n |
| **BetterStack** (free tier) | UptimeRobot | Uptime + status page |
| **PostHog** (free tier) | Mixpanel | Product analytics, funnel tracking, AI cost-per-feature |
| **Cloudflare Turnstile** | hCaptcha | Free no-CAPTCHA bot protection on public forms |
| **Resend + DKIM/SPF/DMARC** | — | Required day 1 or invoices land in spam |

## Responsive & Mobile

- **Mobile-first** Tailwind: design at 360px, scale up. Breakpoints `sm` 640 / `md` 768 / `lg` 1024.
- **Layout shifts:** sidebar → bottom-nav under `md`; tables → cards under `md`; `Dialog` → `Sheet` (drawer) on mobile.
- **Tap targets** ≥ 44×44px; native date/file inputs with `capture` for camera.
- **PWA** via `next-pwa` (manifest + service worker, offline shell). Push notifications later.
- **Lighthouse mobile ≥ 90** required on portal form, closer pipeline, CEO dashboard, task list (CI gate).
- **Auth:** magic links — no password typing on phone.

## Cross-cutting NFRs

Full list (priority + per-phase gates) in [`06-non-functional-requirements.md`](./06-non-functional-requirements.md). Headlines:
- Backups: Supabase Pro PITR + nightly `pg_dump` to Drive
- Soft deletes everywhere; row-level audit on money + identity tables
- 2FA mandatory for CEO / Closer / PM
- All Storage buckets private, signed URLs only, file-type allowlist
- Cloudflare Turnstile + rate limit on public endpoints
- Inbound webhook signature verification + idempotency (`webhook_events`)
- PDPA: consent capture, export-my-data, delete-my-data
- AI cost log + 24h prompt cache + guardrails (forbidden phrases) + human approval before client-facing send
- Multi-currency (MYR default) with FX rate snapshot per transaction; SST tax fields on invoices
- 3 environments: local / staging / production (separate Supabase projects)

## Conventions

- **Language:** TypeScript strict mode, no `any`.
- **DB access:** Server components + server actions only — never expose service role key to client.
- **RLS:** Every table has policies; client role can only read their own client row + linked projects/forms/invoices.
- **Naming:** snake_case in DB, camelCase in TS. Drizzle ORM or supabase-js with generated types.
- **Migrations:** SQL files in `supabase/migrations/`, timestamp-prefixed.
- **n8n workflows:** Exported JSON committed to `n8n/workflows/`.
- **Secrets:** `.env.local` (gitignored). Production via Vercel/Railway env vars.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`).

## Environments

| Env | URL | Purpose |
|---|---|---|
| local | http://localhost:3000 | dev |
| preview | *-nexovadmin.vercel.app | per-PR |
| production | app.nexovadmin.com | live admin + portal |
| marketing site | nexovadmin.com | public (separate Next.js project later, or same monorepo) |

## Responsive & Mobile

- **Mobile-first** Tailwind: design at 360px, scale up. Breakpoints `sm` 640 / `md` 768 / `lg` 1024.
- **Layout shifts:** sidebar → bottom-nav under `md`; tables → cards under `md`; `Dialog` → `Sheet` (drawer) on mobile.
- **Tap targets** ≥ 44×44px; native date/file inputs with `capture` for camera.
- **PWA** via `next-pwa` (manifest + service worker, offline shell). Push notifications later.
- **Lighthouse mobile ≥ 90** required on portal form, closer pipeline, CEO dashboard, task list (CI gate).
- **Auth:** magic links — no password typing on phone.

## Cross-cutting NFRs

Full list (priority + per-phase gates) in [`06-non-functional-requirements.md`](./06-non-functional-requirements.md). Headlines:
- Backups: Supabase Pro PITR + nightly `pg_dump` to Drive
- Soft deletes everywhere; row-level audit on money + identity tables
- 2FA mandatory for CEO / Closer / PM
- All Storage buckets private, signed URLs only, file-type allowlist
- Cloudflare Turnstile + rate limit on public endpoints
- Inbound webhook signature verification + idempotency (`webhook_events`)
- PDPA: consent capture, export-my-data, delete-my-data
- AI cost log + 24h prompt cache + guardrails (forbidden phrases) + human approval before client-facing send
- Multi-currency (MYR default) with FX rate snapshot per transaction; SST tax fields on invoices
- 3 environments: local / staging / production (separate Supabase projects)

## Multi-Provider Routing

Some capabilities use more than one provider. The app/n8n picks per request:

| Capability | Field on record | Providers |
|---|---|---|
| Payments | `invoices.payment_provider` | `lean` (default, regional) \| `stripe` (international) |
| AI generation | per n8n node / per task type | `claude` (client-facing writing) \| `gemini` (bulk, cheap, image/video) |
| File storage | `files.storage_provider` | `supabase` (default) \| `gdrive` (large media / client-shared) |

## Open Questions

- Marketing site: same repo (multi-zone) or separate?
- Use Drizzle ORM or raw supabase-js with generated types? (Lean Drizzle for type-safe joins.)
- Lean.x onboarding: which entity / KYC docs needed before we can issue payment links?
- Default AI router rules — confirm Claude for all client-facing copy, Gemini for everything internal.
- Client portal: same app at `/portal` (recommended) or sub-domain `portal.nexovadmin.com`?
- Supabase region: confirm Singapore (ap-southeast-1) for MY latency + acceptable PDPA posture.
