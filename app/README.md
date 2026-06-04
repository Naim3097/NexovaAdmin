# app/ — Nexova Admin (Next.js 16)

The internal admin + client portal. Single Next.js app, role-based routing.

## Stack snapshot
- Next.js 16 (App Router, Turbopack, RSC)
- React 19, TypeScript strict
- Tailwind v4 + shadcn/ui (Nova preset, slate)
- Supabase (`@supabase/ssr` for cookie-based auth)
- Zod 4 for validation
- next-pwa (manifest + service worker)
- next-intl (English only for now)
- Sentry + PostHog (wiring placeholders)
- Resend for transactional email

## Folder map

```
src/
├── app/
│   ├── (auth)/login/            # magic-link sign-in
│   ├── (admin)/                 # staff routes (dashboard, leads, pipeline, projects, …)
│   ├── (portal)/portal/         # client-facing portal
│   ├── api/health/              # liveness probe
│   ├── auth/callback/           # OAuth/magic-link return
│   ├── offline/                 # PWA offline fallback
│   ├── layout.tsx · page.tsx · globals.css
├── components/ui/               # shadcn primitives
├── lib/
│   ├── auth.ts                  # getCurrentUser, requirePermission
│   ├── env.ts                   # zod-validated env
│   ├── utils.ts                 # cn()
│   └── supabase/
│       ├── client.ts            # browser client
│       ├── server.ts            # RSC/Server-Action/Route-Handler client
│       └── types.ts             # generated DB types (regenerate via npm run db:types)
├── middleware.ts                # session refresh + auth gate
public/
├── manifest.webmanifest
└── robots.txt
scripts/
└── check-rls.ts                 # CI guard: every table must enable RLS
```

## Setup

1. Copy `.env.example` → `.env.local` and fill in Supabase URL + anon key (service role only for scripts).
2. Apply migrations from `../supabase/migrations/` to your Supabase project (via `supabase db push` or the dashboard SQL editor).
3. (Optional) generate DB types: `npm run db:types` (requires `SUPABASE_PROJECT_ID` env).
4. `npm run dev` → http://localhost:3000

## NPM scripts

| Script | Purpose |
|---|---|
| `dev` | Start dev server (Turbopack) |
| `build` | Production build |
| `start` | Run prod build |
| `lint` | ESLint |
| `typecheck` | `tsc --noEmit` |
| `db:types` | Regenerate `src/lib/supabase/types.ts` from live DB |
| `db:check-rls` | Fail if any public table is missing RLS |

## Conventions
- Server-only helpers live under `src/lib/` and may import `next/headers`.
- Client components have `"use client"` at the top.
- Never import the service-role key into a request path; only background scripts/jobs.
- Mobile-first Tailwind: design at 360px, scale up.
- Permissions are checked via `requirePermission("entity.action")` — no hard-coded role enum checks.
