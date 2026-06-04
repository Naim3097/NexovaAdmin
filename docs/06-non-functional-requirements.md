# 06 — Non-Functional Requirements (NFRs)

Cross-cutting concerns we commit to **before** writing app code, so we don't retrofit them.
Every roadmap phase has gates referencing this doc.

Priority key: 🔴 must-have v1 · 🟠 v1 if time, v1.1 latest · 🟡 design-for-now, build-later · 🟢 backlog

---

## 1. Reliability & Data Safety

### 🔴 1.1 Backups & PITR
- Supabase **Pro plan** ($25/mo) for Point-In-Time Recovery (7 days)
- Nightly `pg_dump` to Google Drive (n8n cron, 30-day retention)
- n8n workflows committed to git on every save (auto-export)
- Quarterly **restore drill** (restore to staging, verify)

### 🔴 1.2 Soft deletes
- `deleted_at timestamptz` on: `leads`, `clients`, `deals`, `projects`, `tasks`, `invoices`, `users`, `content_pieces`
- All app queries filter `where deleted_at is null`
- "Trash" view for CEO (30-day recoverable window)

### 🔴 1.3 Row-level audit trail
- Postgres trigger writes old/new row diff to `audit_log` jsonb on UPDATE/DELETE
- Mandatory for: `deals`, `invoices`, `clients`, `users`, `roles`, `user_roles`
- Retain forever (cheap; jsonb)

### 🟠 1.4 Environments
- `local` · `staging` · `production` Supabase projects (3 separate)
- Migrations applied to staging first, validated, then production
- Vercel preview URLs use staging DB

---

## 2. Security

### 🔴 2.1 Auth hardening
- Magic link primary (Supabase Auth)
- **2FA mandatory** for `ceo`, `closer`, `project_manager` roles
- Session timeout: 24h staff, 7d clients
- "Deactivate user" flow auto-reassigns their open tasks/leads

### 🔴 2.2 RLS on every table
- No table without RLS in production (CI check)
- Use `user_has_permission(uid, key)` helper, not raw role checks
- Service-role key NEVER in client bundle (server actions only)

### 🔴 2.3 File security
- Supabase Storage buckets: **all private**
- Access via signed URLs (15 min expiry default)
- RLS on `files` table mirrors entity ownership
- Max upload size enforced (50MB default, configurable)
- File type allowlist (no .exe, .js, .html)
- 🟠 Optional virus scan (ClamAV via n8n on upload)

### 🔴 2.4 Public form protection
- Cloudflare Turnstile (free, no-CAPTCHA) on lead form + portal
- Rate limit: 5 req/min per IP on `/api/leads`
- Honeypot field

### 🔴 2.5 Webhook security
- Every inbound webhook verifies HMAC signature (Lean, Stripe, Meta, Google, Cal.com)
- `webhook_events` table for idempotency (replay-safe via `event_id` unique)
- Reject events older than 5 min (replay protection)

### 🟠 2.6 Secrets management
- All secrets in Vercel/Railway env vars, never in git
- Rotation schedule: API keys every 90 days
- `.env.example` committed; `.env.local` gitignored

---

## 3. Compliance — Malaysian PDPA 2010

### 🔴 3.1 Consent capture
- Privacy policy page on nexovadigital.com + nexovadmin.com
- `data_consent` (jsonb: marketing, analytics, third-party-share) on `clients` and `leads`
- Timestamp of consent stored

### 🔴 3.2 Data subject rights
- Client portal "Export my data" (JSON + uploaded files zip)
- Client portal "Delete my account" → soft delete + 30-day grace → hard purge
- 72h breach notification SOP (documented, not auto)

### 🟠 3.3 Data residency
- Supabase region: **Singapore (ap-southeast-1)** — closest to MY, low latency, acceptable for PDPA
- Document data flow (which data leaves MY: Claude US, Gemini US, Stripe IE, etc.)

---

## 4. Mobile & Accessibility

### 🔴 4.1 Mobile-first responsive
- Tailwind mobile-first breakpoints (`sm` 640, `md` 768, `lg` 1024)
- Sidebar → bottom-nav under `md`
- Tables → cards under `md`
- shadcn `Sheet` instead of `Dialog` on mobile
- Tap targets ≥ 44×44px
- Native inputs for date/time/file with `capture` attr for camera
- **Lighthouse mobile score ≥ 90** on: portal form, closer pipeline, CEO dashboard, task list

### 🟠 4.2 PWA
- Web App Manifest + icons
- Service worker (next-pwa) — offline shell + cache-first for assets
- "Install" prompt for clients
- 🟢 Push notifications (later)

### 🟠 4.3 Accessibility (WCAG 2.1 AA target)
- All shadcn components used = compliant by default; don't override
- Keyboard nav on every flow
- Color contrast ≥ 4.5:1
- alt text on images
- Form labels properly associated

---

## 5. Observability

### 🔴 5.1 Error monitoring
- Sentry (free tier, 5k events/mo) on Next.js + n8n
- Source maps uploaded on deploy
- Slack/Telegram alert on new error type

### 🔴 5.2 Uptime
- BetterStack (free) monitors: app homepage, `/api/health`, n8n webhook URL, Supabase project
- 5-min checks; Telegram alert on down

### 🟠 5.3 Logs
- Vercel logs retained 7d (free); pipe critical logs to Axiom/Logtail (free tier)
- Structured logging (`pino`) — no `console.log` in prod code

### 🟠 5.4 Metrics & product analytics
- PostHog free tier — feature usage, funnel completion (onboarding form, lead → deal)
- Track AI cost per workflow → cost per client (pricing input for BOS)

---

## 6. Email & Communications

### 🔴 6.1 DNS records (do day 1)
- SPF, DKIM, DMARC on `nexovadigital.com` and `nexovadmin.com`
- Verify with mail-tester.com (target: 10/10)

### 🔴 6.2 Notifications layer
- `notifications` table + `notification_preferences` (per-user, per-event-type, per-channel)
- Channels: in-app, email (Resend), Telegram
- Events: lead-assigned, deal-paid, form-submitted, task-due, payment-received, etc.

### 🟠 6.3 Email templates
- React Email components, version-controlled
- Preview environment (`react-email dev`)
- Plain-text fallback always

---

## 7. Performance

### 🟠 7.1 Targets
- LCP < 2.5s on 4G mobile (CEO dashboard, portal)
- Server response p95 < 500ms
- DB queries: indexes on every FK + `status` + `assigned_to` + `created_at`

### 🟠 7.2 Caching
- React Server Component cache where data is non-personal (services catalog, industries)
- `revalidateTag` on writes
- No `force-dynamic` unless necessary

### 🟡 7.3 Search
- Postgres full-text search (`tsvector` columns) on: clients, leads, projects, tasks
- Add when total rows of any entity > 200

---

## 8. AI Governance

### 🔴 8.1 Cost & idempotency
- `ai_requests` table: prompt hash, provider, model, tokens_in, tokens_out, cost_usd, response, created_at
- Cache same-hash prompts for 24h (skip duplicate calls)
- Daily cost dashboard; budget alert per workflow

### 🔴 8.2 Guardrails
- Forbidden phrases list (competitor names, "guaranteed results", profanity) — block + flag
- Client-facing AI output **always requires human approval** (existing rule, enforced by status enum)
- Prompts versioned in git (`/prompts/*.md`)

### 🟠 8.3 PII redaction
- Strip emails/phones/IDs before sending to Claude/Gemini when not strictly needed
- Document which workflows send PII; log it

### 🟡 8.4 Model fallback
- If primary provider down → fallback (Claude → Gemini, Gemini → Claude)
- Per-workflow override in n8n

---

## 9. Money & Multi-Currency

### 🔴 9.1 Currency on every money column (done in 0002)
- `currency` column with default `MYR`
- Store amount in **smallest unit** (cents) for new fields going forward — *or* keep `numeric(12,2)` consistently (current). Don't mix.

### 🔴 9.2 Exchange rates
- `fx_rates` table: from, to, rate, captured_at, source
- Daily fetch from a free API (open.er-api.com)
- Store FX rate **at time of invoice/payment** for accurate historical reporting

### 🟠 9.3 Tax
- SST (Malaysia 6%/8% service tax) — `tax_rate`, `tax_amount` on invoices
- Configurable per service type (some exempt)

---

## 10. Time, Locale, i18n

### 🟠 10.1 Time zones
- DB always `timestamptz` (already)
- UI default `Asia/Kuala_Lumpur`
- Per-user `timezone` preference for intl clients

### 🟡 10.2 i18n scaffolding
- `next-intl` installed day 1, English-only initially
- All UI strings in `/locales/en.json` (no hard-coded text)
- Adding Bahasa Malaysia later = translate one file, no code changes

---

## 11. DevEx & Quality

### 🟠 11.1 CI checks (GitHub Actions)
- TypeScript strict, no errors
- ESLint + Prettier
- `supabase db lint` on migrations
- Check: every table has RLS enabled
- Lighthouse CI mobile budget on PRs

### 🟠 11.2 Testing strategy
- Unit (Vitest) for utility / business logic
- Integration (Vitest + Supabase test container) for server actions
- E2E (Playwright) for: lead → deal → project → onboarding flow + portal form submission
- Run on PR + nightly

### 🟡 11.3 Documentation
- ADRs (Architecture Decision Records) in `/docs/adr/` for every major choice
- `/docs/runbooks/` for operational tasks (restore from backup, rotate Stripe key, etc.)

---

## 12. Future-Proofing

### 🟡 12.1 Multi-tenant readiness (for BOS resale)
- Don't add `tenant_id` yet, but:
- Keep all queries through a server-side context object — easy to inject `tenant_id` later
- Design URL structure compatible: `/[tenant]/...` future, `/...` now

### 🟢 12.2 Mobile native apps — deferred (PWA first)
### 🟢 12.3 Real-time collab features — deferred
### 🟢 12.4 Public API for clients — backlog

---

## NFR Gates per Roadmap Phase

| Phase | Must satisfy before merging |
|---|---|
| **Week 1 Foundation** | 1.1 backups, 1.2 soft deletes, 2.1 auth, 2.2 RLS, 5.1 Sentry, 5.2 uptime, 6.1 DNS, 9.1 currency |
| **Week 2 Onboarding** | 2.3 file security, 2.4 form protection, 3.1 consent, 4.1 mobile, 8.1 AI cost log |
| **Week 3 Pipeline** | 1.3 audit on deals, 2.5 webhook signatures, 8.2 AI guardrails, 6.2 notifications |
| **Week 4 Dashboard** | 4.1 mobile (CEO), 7.1 perf targets, 5.4 PostHog |
| **Week 5–6 Ads/Content** | 8.1/8.2 enforced for all AI calls, 1.3 audit on content_pieces |
| **Week 7+ Invoicing** | 9.2 FX rates, 9.3 tax, 1.3 audit on invoices |
