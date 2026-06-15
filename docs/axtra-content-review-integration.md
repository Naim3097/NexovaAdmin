# Axtra Content-Review → Nexov Admin Integration Plan

> **Goal:** Rebuild the proven Axtra agency↔client **content review / approval loop** as a
> native module inside Nexov Admin (Supabase + Next.js), with **data-driven clients** as the
> first priority. Axtra (the old Firebase app) is treated as a **spec, not a codebase** —
> nothing is migrated; we reuse what Nexov Admin already has and add only the missing loop.
>
> Reference: [Axtra legacy spec](./axtra-legacy-spec.md) (the old build's documented behavior, kept
> in-repo so Nexov Admin has no dependency on the separate Axtra clone).

---

## 1. What we keep from Axtra (the product logic worth rebuilding)

The *workflow* is good; only the implementation was dated. Keep:

1. **Versioned draft ladder** — `Draft 1 → Draft 2 → Draft 3 → Final` per content item.
2. **Capped feedback cycles** — a hard, **configurable** limit (Axtra hardcoded 3) on client revision rounds.
3. **Client-facing review** — client can **Approve** or **Request Changes** with a comment/attachment.
4. **Two work types** — recurring monthly deliverables *and* one-off requests.
5. **Monthly report delivery** to the client.

## 2. What we throw away (Axtra's dated implementation)

- Firebase, hardcoded API key, static export, all client-side trust.
- **Hardcoded clients & deliverables** (`CLIENT_CONFIG`, `CLIENTS[]`, `EMAIL_TO_DOMAIN_MAP`).
- Email-string role checks; fragile `{email}_{id}` doc IDs and `C6`-parsing hacks.
- Split-brain status (`completed` vs `awaiting_approval`), `billing` vs `invoices` mismatch.
- Stub `sendNotification()`.
- Hardcoded per-client report pages.

---

## 3. What Nexov Admin ALREADY has (so we don't rebuild it)

| Capability | Where | Reuse as-is? |
|---|---|---|
| **Data-driven clients** | `clients` table + `/settings/clients` | ✅ Yes — clients already DB-driven |
| **Content entity** | `content_posts` table + `/content`, `/content/calendar`, `/content/[id]` | ⚠️ Extend — it's a *publishing calendar*, no review loop |
| **Client portal (token)** | `(portal)/p/[token]` + `projects.portal_token` | ⚠️ Extend — currently **read-only** status viewer |
| **Deliverable approval concept** | `projects.deliverables[].approvedAt`, `signoff` jsonb | Pattern to mirror (admin-side today) |
| **Notifications + Telegram** | `notifications` table + `notify()` ([notifications.ts](../app/src/lib/data/notifications.ts)) | ✅ Yes — just add new kinds |
| **Reports (data-driven)** | `/reports/client/[client]/[month]` | ⚠️ Extend — add a "content delivered" section |
| **Agent tool registry** | [`src/lib/agent/tools.ts`](../app/src/lib/agent/tools.ts) (`<entity>.<verb>`) | ✅ Yes — register new content tools |
| **Data-adapter pattern** | `src/lib/data/*` (dev-store + Supabase via `isSupabaseEnabled`) | ✅ Yes — follow it exactly |
| **Audit trail** | `audit_events` | ✅ Yes — extend `entity` check to include content |

### The precise gap
`content_posts` status today: `idea → draft → review → scheduled → posted → archived`. It has **no
draft versions, no feedback thread, no revision-cycle cap, and no client-side approve/request-changes**.
The portal is a **read-only** project-progress viewer. **That interactive content-review loop is the
entire thing we're building.**

---

## 4. Design principles (match the house style)

1. **One content entity.** Extend `content_posts`; do **not** introduce a parallel "submissions" system.
2. **Embed child collections as `jsonb`** on the parent row — exactly like `projects.deliverables` /
   `.stages` / `.tasks` / `.signoff`. So `drafts[]` and `feedback[]` live on the `content_posts` row.
3. **Server-side authority.** All writes go through `src/lib/data/content.ts` functions called from
   **server actions / API routes**. The portal is unauthenticated (token-based) — client actions are
   authorized by validating `portal_token` server-side, never by client trust or open RLS.
4. **Config over code.** Per-client revision limit & monthly quota live in the DB, not in JS.
5. **Notify through `notify()`** so every event fans out to in-app + Telegram for free.
6. **Register every new capability** as an agent tool (`content.*`).
7. **Nexov Admin look only.** All UI — admin *and* client portal — uses the existing Nexov Admin
   design system: shadcn/ui components (`Button`, `Input`, `Badge`, `Card`, …) and the theme tokens
   (`bg-card`, `border`, `text-muted-foreground`, `bg-background`). The legacy Axtra aesthetic (purple
   gradients, star field, cosmic glow, `nx-*` classes, `dangerouslySetInnerHTML` animations) is **not**
   carried over. There is no separate "Axtra" app or folder — this is one codebase.

---

## 5. Data model changes

### 5.1 Extend `clients` (Priority #1 — data-driven plans)
```sql
alter table public.clients
  add column if not exists content_revision_limit int  not null default 3,
  add column if not exists monthly_content_quota  int  not null default 0,
  add column if not exists portal_token           text not null default '';
create unique index if not exists clients_portal_token_idx
  on public.clients (portal_token) where portal_token <> '';
```
This replaces Axtra's `CLIENT_CONFIG` deliverable arrays: onboarding a client = set their quota +
revision limit in `/settings/clients`, **no code edit**. A **client-level** `portal_token` lets the
portal show *all* of a client's content (Axtra was per-client; today's portal is per-project).

### 5.2 Extend `content_posts` with the review loop (jsonb, house style)
```sql
alter table public.content_posts
  add column if not exists review_status   text not null default 'none'
     check (review_status in ('none','awaiting_client','changes_requested','approved')),
  add column if not exists draft_number    text not null default '',     -- 'Draft 1'..'Final Draft'
  add column if not exists revisions_used  int  not null default 0,
  add column if not exists current_file_url text not null default '',
  add column if not exists drafts          jsonb not null default '[]'::jsonb,
  add column if not exists feedback        jsonb not null default '[]'::jsonb,
  add column if not exists approved_at     timestamptz,
  add column if not exists approved_by     text not null default '',
  add column if not exists plan_month      text not null default '';     -- 'YYYY-MM' for retainer plans
```
- **`drafts[]`** item: `{ id, draftNumber, fileUrl, caption, submittedAt, submittedBy }`
- **`feedback[]`** item: `{ id, draftId, author: 'client'|'agency', body, fileUrl, cycle, createdAt }`
- `review_status` is the **single source of truth** for the loop (kills Axtra's split-brain).
- Cap enforced server-side: `revisions_used >= clients.content_revision_limit` blocks new feedback.

> The existing publishing `status` (`idea`…`posted`) stays for the social-calendar lifecycle;
> `review_status` is an orthogonal axis for the client-approval loop. A post can be `status:'review'`
> + `review_status:'awaiting_client'`.

### 5.3 One-off requests (Track B)
Reuse `content_posts` with a flag instead of a second system: add
`origin text not null default 'plan' check (origin in ('plan','request'))`. A client request creates a
`content_posts` row with `origin:'request'`, `review_status:'none'`. No separate `contentOrders`/
`submittedContent` tables.

### 5.4 Notifications + audit
```sql
-- add kinds
... check (kind in (..., 'content_draft_submitted','content_changes_requested','content_approved', ...));
-- audit entity
alter table public.audit_events drop constraint ...; -- add 'content' to entity check
```

> **Migration number:** next free file (0005 is latest applied here; `0006_quotations` is noted as
> pending — land this as `0006`/`0007` accordingly). Applied manually via Supabase SQL editor per
> repo convention.

---

## 6. Data-adapter & server-action surface (`src/lib/data/content.ts`)

Add to the existing adapter (dual dev-store/Supabase, same as the current functions):

| Function | Does | Notifies |
|---|---|---|
| `submitDraft(id, {fileUrl, caption, draftNumber})` | Append to `drafts[]`, set `current_file_url`, `review_status='awaiting_client'` | `content_draft_submitted` |
| `requestChanges(id, {body, fileUrl}, viaToken)` | Append client `feedback[]`, `revisions_used++` (enforce cap), `review_status='changes_requested'` | `content_changes_requested` |
| `approveContent(id, {by}, viaToken)` | `review_status='approved'`, `approved_at/by`, lock further feedback | `content_approved` |
| `agencyReply(id, {body})` | Append agency `feedback[]` | — |
| `generateMonthlyPlan(clientName, month)` | Create `monthly_content_quota` draft `content_posts` for the month (`origin:'plan'`, `plan_month`) | — |
| `createContentRequest(clientName, {...}, viaToken)` | Client one-off request → `content_posts` `origin:'request'` | `content_draft_submitted`(req) |

Portal-originated writes (`viaToken`) are wrapped by a server action that loads the client by
`portal_token` and asserts the content row belongs to that client **before** calling the adapter.

---

## 7. UI changes

### Admin (`/content`)
- `/content/[id]`: add a **Review panel** — upload draft (→ `submitDraft`), see the feedback thread,
  reply, view `review_status` + revisions used/limit.
- `/content` list: filter by `review_status`; badge for "awaiting client / changes requested / approved".
- `/settings/clients/[id]`: add **revision limit** + **monthly quota** fields, and a
  **"Generate this month's plan"** button (→ `generateMonthlyPlan`).

### Client portal (`/p/[token]`)
- Make the token resolve a **client** (new `clients.portal_token`) and render their content for the
  current month: each item shows the latest draft, the thread, and **Approve** / **Request changes**
  buttons (server actions). One-off **"Request content"** form (→ `createContentRequest`).
- Keep the existing project-progress view; content review is an added section/tab.

### Reports
- Add a **"Content delivered this month"** section to `/reports/client/[client]/[month]` sourced from
  `content_posts where review_status='approved' and plan_month=month`. Replaces Axtra's hardcoded
  report pages with live data.

---

## 8. Agent tools to register (`src/lib/agent/tools.ts`)

Per the registry convention (`<entity>.<verb>`, Zod in/out):
`content.submitDraft`, `content.requestChanges`, `content.approve`, `content.generatePlan`,
`content.createRequest`. This keeps the "AI agent controls everything" foundation intact — the loop is
drivable by the agent, not just the UI.

---

## 9. Phased roadmap

| Phase | Deliverable | Why this order |
|---|---|---|
| **1 — Data-driven plans** *(priority #1)* | `clients` quota/revision-limit/portal_token columns; `content_posts` `plan_month`/`origin`; `generateMonthlyPlan`; settings UI + plan generator | Kills hardcoded `CLIENT_CONFIG`; everything else builds on per-client config |
| **2 — Draft versioning (admin)** | `drafts[]`, `review_status`, `submitDraft`, agency Review panel on `/content/[id]` | The agency half of the loop, fully usable internally first |
| **3 — Interactive portal** | `clients.portal_token` resolution, Approve / Request changes server actions, capped feedback, one-off request form | The client half — the actual Axtra value, now server-secured |
| **4 — Notify + agent tools + reports** | New notification kinds via `notify()`, `content.*` agent tools, "content delivered" report section | Polish + automation + the foundation hooks |

Each phase ships independently and leaves the app working.

---

## 10. Open decisions (confirm before Phase 1)

1. **Plan model:** auto-generate N blank `content_posts` per month from the quota (simple), **or** a
   richer per-client *content plan template* (named deliverable types like Axtra's "Static Visual ×15,
   Reel ×2")? The template is closer to Axtra; the quota is simpler. *Recommend: start with quota +
   a free-text deliverable type, add templates later.*
2. **Portal scope:** client-level token (all their content) vs keep per-project tokens. *Recommend
   client-level* `clients.portal_token` *for the content portal.*
3. **File storage:** Supabase Storage bucket layout for drafts/feedback attachments (e.g.
   `content/{clientId}/{contentId}/{draftId}_{name}`).
4. **Revision cap default:** keep Axtra's 3 as the `clients.content_revision_limit` default? *Recommend yes.*
