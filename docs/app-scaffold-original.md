# app/ — Next.js application

This folder will hold the Next.js 15 app (admin dashboard, team views, client portal).

## Initial scaffold command

Run from the repo root:

```powershell
cd app
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
npx shadcn@latest init
npm install @supabase/supabase-js @supabase/ssr stripe resend zod
npm install -D @types/node
```

## Planned route structure

```
src/app/
├── (public)/                # marketing pages (later — separate project)
├── (auth)/
│   └── login/
├── (admin)/                 # role: ceo, closer, frontend, backend, uiux
│   ├── dashboard/           # CEO KPIs
│   ├── leads/
│   ├── pipeline/            # closer kanban
│   ├── projects/
│   │   └── [id]/
│   ├── campaigns/
│   ├── content/
│   ├── invoices/
│   └── settings/
├── (portal)/                # role: client
│   └── portal/
│       ├── dashboard/
│       ├── onboarding/[formId]/
│       ├── projects/[id]/
│       └── invoices/
└── api/
    ├── webhooks/
    │   ├── stripe/
    │   ├── calcom/
    │   └── n8n/
    └── trpc/  (optional)
```
