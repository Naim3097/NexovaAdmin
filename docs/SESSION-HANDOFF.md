# Session handoff — resume here

> Point a new session at this file. It's the "control tower": current state + exactly what to do next, across both projects. Detailed background lives in auto-loaded memory (`MEMORY.md`) and the docs referenced below.
> **Compiled:** 2026-06-11. **Repo:** `Naim3097/NexovaAdmin` (this = the IMS). Branch `main`, clean, pushed.

---

## Two parallel tracks

1. **Nexova Admin (the IMS)** — THIS repo. Internal ops platform (leads → pipeline → onboarding → projects → invoices). Built, working on real Supabase, pushed to GitHub. **Being deployed to Vercel (in progress).**
2. **Nexova Digital website** — a SEPARATE project, not yet started. Full spec at
   `C:\Users\danis\Desktop\Danisy\Websites\Nexova\NEXOVA-DIGITAL-WEBSITE-BRIEF.md` (standalone, build-ready). Its leads must POST into THIS IMS.

A new session **in this repo** auto-loads memory: `MEMORY.md` + `project_phase`, `project_nexova_digital_site`, `feedback_no_ai_disclosure`, `feedback_pending_prod`, etc. Trust those; verify against code before asserting.

---

## IMS — what's DONE this session (all committed on `main`)
- **Delivery Workflows** feature: per-service editable stage pipelines (Settings → Workflows) instantiated as editable per-project stages; replaced AI task lists; client portal shows real stages. Migration **0005**.
- **Team invite flow** (Team → Invite): server-side `verifyOtp` via `/auth/confirm` → set-password; `needs_password` gate; migration **0004** (`team_members.user_id`).
- **"Complete to usable" pass**: error boundaries, lead→client promote, seed script (`npm run seed`), settings setup-status panel.
- **Full brand design system**: Nexova blue `#2563eb`, Satoshi font, logo, light theme, no emojis. Fixed a real bug (self-referential `--font-sans` → was rendering Times serif).
- **Perf pass**: React `cache()` dedupe, `unstable_cache` datalists, parallelized awaits.
- Migrations **0004 + 0005 are APPLIED** to the live Supabase (verified via REST).

## IMS — DEPLOY STATUS (the active task)
- GitHub repo live; pushing to `main` auto-deploys on Vercel.
- **Vercel env vars** were added; the 3 `NEXT_PUBLIC_*` were mistakenly marked "Sensitive" (Vercel hides Sensitive values → looked empty / build failed). Founder was re-adding them **non-sensitive**. **VERIFY the latest Vercel deploy is GREEN.** Required env (from `app/.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (the real Vercel/prod URL), `USE_SUPABASE=1`, `DEV_AUTH_BYPASS=0`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_TEAM_CHAT_ID`.
- **Root Directory = `app`** in Vercel (correct — the Next app is in `app/`, not repo root).
- **PERF — important finding:** the Supabase DB is **already in Singapore** (~20–38ms from MY; verified by latency probe — NOT US-East as first assumed). So **no DB migration needed.** The real lever: set **Vercel → Settings → Functions → Region → Singapore (sin1)** so functions sit next to the DB. Do this after the deploy is green.

## IMS — NEXT ACTIONS (priority order)
1. **Confirm Vercel deploy is green** (env vars fixed). If failing, read the build log; it's almost always a missing/sensitive env var, not code.
2. **Set Vercel function region → Singapore (sin1).** Biggest live-speed win.
3. After deploy: in Supabase → Auth → URL config, add the prod domain (Site URL + `…/auth/callback` + `…/auth/confirm`).
4. Run `npm run seed` once against prod if not already (9 services + agency profile).
5. Remaining external setup (see `docs/pending-production-setup.md` + `feedback_pending_prod` memory): Supabase Auth SMTP→Resend (auto-email invites), Resend custom domain, LeanX KYC.
6. **Deferred (not needed for usable):** n8n workflows, 2FA/real permissions, PDPA export/delete, Stripe.

## IMS — environment facts
- Supabase project ref `gdinummzvbwjfdesqfpt` (Singapore region). Real keys in `app/.env.local` (gitignored).
- Next.js 16 + React 19 + Tailwind v4 + Supabase. ⚠️ Next 16 has breaking changes — read `app/node_modules/next/dist/docs/` before writing Next code (e.g. `revalidateTag(tag, profile)` is now 2-arg; middleware is `proxy.ts`).
- Dev server: `cd app && npm run dev` → http://localhost:3001. To preview auth-gated pages locally, temporarily set `DEV_AUTH_BYPASS=1` then **revert to 0**.
- `git` auth works via Git Credential Manager; `gh` CLI is NOT installed.

---

## Website — how to start (in a NEW session, NEW folder/repo)
1. Open the brief: `…\Desktop\Danisy\Websites\Nexova\NEXOVA-DIGITAL-WEBSITE-BRIEF.md` — it's the complete spec (decisions, brand, real proof, sitemap, SEO checklist, animation stack, anti-AI rules).
2. Key locked decisions: separate Vercel project at nexovadigital.com · multi-page · **bilingual EN + BM** · full-service positioning · fresh copy · portfolio proof · indicative "from RM X" pricing · **leads → this IMS** via a new `POST /api/public/leads` endpoint (to be built HERE).
3. **NON-NEGOTIABLE: never disclose/market AI** on the public or client-facing site (sell speed/outcomes, not the mechanism). See `feedback_no_ai_disclosure` memory.
4. Recommended stack: Next.js 16, Tailwind, next-intl, Framer Motion + GSAP/ScrollTrigger + Lenis (restrained), next/image + next/og. Deploy Vercel region sin1.
5. Open inputs (founder providing later): real domain, office address + IG/TikTok (use dummy now), testimonials + result numbers (later), SVG logo (PNG fine for now).

---

## How to resume cleanly
- **New session in THIS repo** → say: *"Read docs/SESSION-HANDOFF.md and continue the Vercel deploy."* Memory loads automatically.
- **New session for the website** → new folder, then: *"Read NEXOVA-DIGITAL-WEBSITE-BRIEF.md and scaffold the site."*
- Keep them as two separate sessions/repos.
