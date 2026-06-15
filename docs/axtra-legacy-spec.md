# Axtra Workspace — Platform Flow (Content Creation → Submit → Feedback → Reporting)

> **Scope:** This document explains the *core operating loop* of the platform: how content gets
> created, submitted, reviewed/fed-back, approved, and how monthly reports are delivered.
> Auth, billing internals, and profile pages are only mentioned where they touch this loop.
>
> **Stack:** Next.js 15 (App Router, `output: 'export'` static build) + React 19 + Firebase
> (Auth, Firestore, Storage). No backend server — all logic runs client-side and talks to Firebase
> directly. Firebase config is hardcoded in [`lib/firebase.js`](../lib/firebase.js).

---

## 1. Who uses it — two roles

| Role | How they're identified | Lands on |
|------|------------------------|----------|
| **Agency** (Nexova) | Hardcoded emails: `sales@nexovadigital.com`, `agency@nexovadigital.com` (see `isAgency()` in [`firestore.rules`](../firestore.rules) and direct checks in pages) | `/agency-dashboard`, `/agency-content-planner`, `/agency-content-orders`, `/axtraspace`, `/upload-report` |
| **Client** | Matched by **email domain** against `CLIENT_CONFIG` / `EMAIL_TO_DOMAIN_MAP` in [`components/AxtraClientLogics.js`](../components/AxtraClientLogics.js) | `/dashboard`, `/planner`, `/axtranote`, `/reports`, `/billing` |

> ⚠️ Roles are **email-based, not a DB role field.** The agency allow-list lives in three places
> (firestore.rules, `EMAIL_TO_DOMAIN_MAP`, and inline checks in `upload-report`/`agency-dashboard`).
> `agency-dashboard` is even stricter — it only accepts `sales@nexovadigital.com`.

### Clients are pre-configured (not self-serve)
Every client, their email, and their **fixed list of deliverables** are hardcoded. The two main
config blocks are:
- `CLIENT_CONFIG` in `AxtraClientLogics.js` (client-side view) — 8 clients.
- `CLIENTS` array in [`app/agency-content-planner/page.js`](../app/agency-content-planner/page.js) and
  [`app/axtraspace/page.js`](../app/axtraspace/page.js) (agency view).

Deliverables use ID prefixes: `C#` = Static Visual, `P#` = Social Post, `V#`/`G#` = Reel/Video/Google Ad,
`B#` = Blog. Example: Enfrasys has `C1`–`C15`.

---

## 2. The platform has TWO parallel content tracks

This is the single most important thing to understand. There are **two independent workflows**, each
with its own collections and pages:

| | **Track A — Monthly Deliverables** | **Track B — One-off Content Orders** |
|---|---|---|
| **What** | The pre-agreed monthly content package (the hardcoded deliverables) | Ad-hoc extra content the client requests on demand |
| **Client page** | `/planner` and `/axtraspace`* | `/axtranote` |
| **Agency page** | `/agency-content-planner`, `/axtraspace` | `/agency-content-orders` |
| **Firestore** | `contentDirections`, `contentSubmissions`, `revisions` | `contentOrders` (+ `contentOrders/{id}/revisions` subcollection), `submittedContent` |
| **Order created by** | Pre-seeded / config-driven | Client clicks "New Order" on `/axtranote` |

\* `/axtraspace` is a **unified agency workspace** that also contains the client approval/feedback
logic. In practice the agency selects a client and drives Track A from there.

---

## 3. Data model (collections & key fields)

### `contentDirections` — client's brief for a deliverable
Doc ID: `{clientEmail}_{contentId}` (e.g. `marketing@enfrasys.com_C3`)

| Field | Meaning |
|-------|---------|
| `contentId` | Deliverable id (`C3`) |
| `clientEmail` | lowercased client email (the join key everywhere) |
| `direction` | Free-text brief from the client |
| `fileUrl` | Optional reference file (Storage URL) |
| `status` | `direction_submitted` |
| `createdAt`, `directionSubmittedAt` | Timestamps |
| `firstDraftDeadline` | `createdAt + 3 days` |

### `contentSubmissions` — the draft/asset for a deliverable (the heart of Track A)
Doc ID: `{clientEmail}_{contentId}`

| Field | Meaning |
|-------|---------|
| `contentId`, `clientEmail` | Join keys |
| `caption` | Caption copy for the asset |
| `fileUrl` | The uploaded visual/draft |
| `draftNumber` | `Draft 1` → `Draft 2` → `Draft 3` → `Final Draft` |
| `status` | One of `STATUS_TYPES` (see §6) |
| `hasDirection`, `directionText`, `directionFileUrl` | Mirrored from the brief |
| `submittedAt`, `createdAt`, `lastUpdatedAt`, `lastFeedbackAt` | Timestamps |
| `approvedAt`, `approvedBy`, `completedAt`, `isFinalDraft` | Set on approval |
| `visualHeadline`, `internalNotes` | Agency-internal fields (set in `/axtraspace`) |

### `revisions` — feedback log for Track A (one doc per feedback or approval event)
Doc ID: auto-generated

| Field | Meaning |
|-------|---------|
| `contentId`, `clientEmail` | Join keys |
| `feedback` | The feedback text (or `"Content has been approved by client"`) |
| `fileUrl` | Optional attachment |
| `status` | `Submitted` (new) → `Resolved` (agency addressed it); approvals use `approved` |
| `feedbackCycle` | 1–3 (hard cap of 3 — see §5) |
| `draftNumber`, `nextDraftStage` | Draft progression context |
| `by` | Who left it (`Client` / agency email) |
| `isApproval` | `true` for approval entries |
| `createdAt`, `resolvedAt` | Timestamps |

### `contentOrders` — one-off order header (Track B)
Doc ID: auto-generated. Created from `/axtranote`.

| Field | Meaning |
|-------|---------|
| `clientEmail` | Owner |
| `contentType` | e.g. "Instagram Reel" |
| `instructions` | What the client wants |
| `fileUrl` | Optional reference file |
| `assignedTo` | (empty at creation) |
| `status` | `Pending` → `In Progress` → `Completed` |
| `lastAction`, `lastUpdated` | Activity trail |

**Subcollection `contentOrders/{id}/revisions`** holds the back-and-forth: agency drafts (`by: 'Agency'`,
with `draftNumber`, `caption`, `copywriting`, `fileUrl`, `fileType`) and client feedback
(`by: 'Client'`, `draftNumber: 'Client Feedback'`, `comment`).

### `submittedContent` — agency deliverable for an order (Track B, client-readable feed)
Doc ID: auto-generated.

| Field | Meaning |
|-------|---------|
| `orderId` | Links back to the `contentOrders` doc |
| `fileUrl`, `caption`, `copywriting`, `fileType` | The delivered content (`fileType`: `image`/`document`/`copyOnly`) |
| `draftStage` | `Draft 1`…`Final Draft` |
| `status` | `In Progress`, or `Completed` when `Final Draft` |
| `clientEmail` | Owner |
| `likes`, `comments` | Social-style engagement (largely unused) |

### `reports` — monthly client report (delivery)
Doc ID: auto-generated. Created from `/upload-report`.

| Field | Meaning |
|-------|---------|
| `clientEmail` | Owner |
| `month` | `YYYY-MM` |
| `title` | e.g. "April 2025 Report" |
| `status` | `Pending` / `Paid` |
| `fileUrl` | The report file (PDF/etc.) |
| `type` | `Report` |
| `uploadedBy`, `createdAt` | Audit |

### `billing` / `invoices` — money docs
`/upload-report` writes invoices into the **`billing`** collection (with `paymentNote`,
`paymentReceiptUrl`, `paymentSubmittedAt`). ⚠️ **Naming inconsistency:** both the agency and client
dashboards listen to a collection named **`invoices`**, not `billing` — so invoice notifications won't
fire for docs created by `upload-report`. Worth reconciling.

### `users`
Profile docs keyed by `uid`. Outside the core loop.

---

## 4. Track A flow — Monthly Deliverables (step by step)

```
(optional) Client brief        Agency uploads draft        Client reviews
 contentDirections      ──►     contentSubmissions    ──►   ┌─ Approve  → status APPROVED
 (status:direction_              (status: awaiting_         └─ Feedback → revisions(Submitted),
  submitted)                      approval / completed)        draft advances, max 3 cycles
                                                                     │
                                                                     ▼
                                                       Agency uploads next draft,
                                                       marks revision "Resolved"  ──► (loop)
```

1. **(Optional) Client submits a direction/brief.**
   `submitContentDirection()` in `AxtraClientLogics.js` writes a `contentDirections` doc **and**
   seeds a `contentSubmissions` doc (`status: in_progress`, `draftNumber: Draft 1`,
   `firstDraftDeadline = now + 3 days`). A direction file (if any) uploads to
   `contentDirections/{uid}/...`.

2. **Agency uploads a draft.** Two entry points exist:
   - [`/agency-content-planner`](../app/agency-content-planner/page.js) → `setDoc` on
     `contentSubmissions/{email}_{cid}` with **`status: completed`**, plus marks the latest
     `Submitted` revision as `Resolved`. File → `deliverables/{email}/...`.
   - [`/axtraspace`](../app/axtraspace/page.js) `handleSubmitContent()` → same doc but
     **`status: awaiting_approval`** (the value the client UI counts as a notification). File →
     `deliverables/{emailSegment}/...`.
   > ⚠️ The two pages set **different statuses** for the same action — a real inconsistency to be
   > aware of when reasoning about state.

3. **Client reviews** on `/planner` (table view) or in `/axtraspace`:
   - **Request changes** → `submitFeedback()` / `handleSubmitFeedback()` adds a `revisions` doc
     (`status: Submitted`, `feedbackCycle: n+1`), advances `contentSubmissions.draftNumber` to the
     next stage, and sets submission `status` to `in_progress` (or `completed` on the final stage).
     Feedback file → `revisions/{uid}/...` or `client_feedback/{emailSegment}/...`.
   - **Approve** → `approveContent()` sets `contentSubmissions.status = approved` +
     `approvedAt/approvedBy/completedAt/isFinalDraft`, and logs an approval entry in `revisions`
     (`isApproval: true`).

4. **Agency sees feedback.** New feedback (`revisions` where `status == 'Submitted'`) surfaces in the
   Feedback column of `/agency-content-planner` and as a notification on `/agency-dashboard`. Agency
   uploads the next draft → cycle repeats.

**Draft ladder:** `Draft 1 → Draft 2 → Draft 3 → Final Draft` (`DRAFT_STAGES`). Reaching
`Final Draft`/`approved`/`completed` ends the loop for that item.

---

## 5. The 3-cycle feedback rule

Each deliverable allows a **maximum of 3 feedback cycles**. Enforced in both `submitFeedback()` and
`/axtraspace`'s `handleSubmitFeedback()`:

```js
const feedbackUsed = revisionLog.filter(r => r.contentId === contentId).length;
if (feedbackUsed >= 3) return { error: 'Maximum feedback cycles (3) reached…' };
const feedbackRemaining = Math.max(3 - feedbackUsed, 0);
```

`/planner` additionally treats an item as **final** once `history.length >= 4` or
`draftNumber === 'Final Draft'`.

---

## 6. Track B flow — One-off Content Orders

```
Client creates order          Agency delivers draft              Client reviews
 contentOrders (Pending)  ──►  contentOrders/{id}/revisions  ──►  comment → same subcollection
 from /axtranote               + submittedContent                 (by:'Client')
                               + order status In Progress/Completed
```

1. **Client creates an order** on [`/axtranote`](../app/axtranote/page.js): `addDoc('contentOrders')`
   with `status: 'Pending'`, `contentType`, `instructions`, optional `fileUrl`
   (→ `contentOrders/{uid}/...`).

2. **Agency fulfils it** on [`/agency-content-orders`](../app/agency-content-orders/page.js)
   `handleDraftSubmit()`:
   - adds a draft to `contentOrders/{id}/revisions` (`by: 'Agency'`, `draftNumber`, `fileType`),
   - adds a client-facing `submittedContent` doc,
   - updates the order `status` → `In Progress`, or `Completed` if the stage is `Final Draft`.
   - File → `contentOrders/{orderId}/{stage}_{ts}_{name}`.

3. **Client reviews** on `/axtranote`: sees the `submittedContent` feed for each order and posts
   feedback into `contentOrders/{id}/revisions` (`by: 'Client'`, `draftNumber: 'Client Feedback'`,
   `comment`). New orders (`status == 'Pending'`) notify the agency dashboard.

---

## 7. Reporting flow

Reporting is **delivery of a finished monthly report file** — not an analytics engine.

1. **Agency uploads a report** on [`/upload-report`](../app/upload-report/page.js) (agency-only):
   pick client + month + title + status + file. Report files → Storage `reports/{email}/...`;
   metadata → `reports` collection. (The same page also uploads invoices → `billing` collection.)

2. **Client views reports** on [`/reports`](../app/reports/page.js): real-time `onSnapshot` on
   `reports where clientEmail == me orderBy month desc`. Shows title, month, status badge
   (`Paid`/`Pending`), and a download link (`fileUrl`).

3. **Sample/static reports.** `/reports` also links to two **hardcoded, image-gallery style** report
   pages built entirely in React (no DB):
   - [`/reportenfrasysjune2025`](../app/reportenfrasysjune2025/page.js) — "69 Assets, 3 Campaigns, A4 Printable"
   - [`/reportenfrasysapril2025`](../app/reportenfrasysapril2025/page.js) — "27 Assets, Interactive"

   These render images from the local `Enfrasys Reporting/` folder and serve as showcase templates,
   not data-driven reports.

---

## 8. Status reference

**`STATUS_TYPES`** (deliverables, in `AxtraClientLogics.js`) — computed from deadlines + submissions:

| Value | Meaning |
|-------|---------|
| `awaiting_direction` | No brief yet |
| `direction_submitted` | Brief in, awaiting draft |
| `direction_due_soon` / `direction_overdue` | Brief deadline pressure |
| `draft_due_soon` / `draft_overdue` | First-draft deadline pressure |
| `in_progress` | Active draft cycle |
| `pending` | Default/idle (agency planner fallback) |
| `awaiting_approval` | Draft uploaded, waiting on client (counts as a client notification) |
| `completed` | Final stage reached |
| `approved` | Client approved (terminal) |

**Other status fields:**
- `revisions.status`: `Submitted` → `Resolved`; approvals use `approved`.
- `contentOrders` / `submittedContent`: `Pending`, `In Progress`, `Completed`.
- `reports` / `billing`: `Pending`, `Paid` (dashboards also look for `Sent` invoices).

---

## 9. Firebase Storage path map

| Path | Written by | Purpose |
|------|-----------|---------|
| `contentDirections/{uid}/{cid}_{ts}_{name}` | Client | Brief reference file |
| `contentSubmissions/{uid}/{cid}_{ts}_{name}` | Client (`submitDraft`) | Draft via logic helper |
| `deliverables/{email}/{cid}_{draft}_{ts}_{name}` | Agency (`/agency-content-planner`) | Deliverable asset |
| `deliverables/{emailSegment}/...` | Agency (`/axtraspace`) | Deliverable asset (`.`/`@`→`_`) |
| `revisions/{uid}/{ts}_{name}` | Client (`/planner`, logic) | Feedback attachment |
| `client_feedback/{emailSegment}/{ts}_{name}` | `/axtraspace` | Feedback attachment |
| `contentOrders/{uid}/{ts}_{name}` | Client (`/axtranote`) | Order reference file |
| `contentOrders/{orderId}/{stage}_{ts}_{name}` | Agency | Order draft |
| `reports/{email}/{ts}_{name}` | Agency | Monthly report file |
| `invoices/{email}/{ts}_{name}` | Agency | Invoice file |

---

## 10. Page / route map

| Route | Role | Role in the loop |
|-------|------|------------------|
| `/` | public | Landing ("Welcome to AxtraSpace") → Sign In / Create Account |
| `/login`, `/signup` | public | Firebase email/password auth |
| `/agency-dashboard` | agency | Hub + real-time notifications (feedback / orders / invoices) |
| `/agency-content-planner` | agency | **Track A:** upload deliverable drafts, see client feedback |
| `/agency-content-orders` | agency | **Track B:** fulfil one-off orders |
| `/axtraspace` | agency (unified) | Track A workspace: select client, upload drafts, view feedback/approvals |
| `/upload-report` | agency | Upload monthly **reports** and **invoices** |
| `/dashboard` | client | Client hub + notifications |
| `/planner` | client | **Track A:** review drafts, leave feedback (table view) |
| `/axtranote` | client | **Track B:** create orders, review `submittedContent`, comment |
| `/reports` | client | View/download monthly reports + sample reports |
| `/billing` | client | View invoices / submit payment proof |
| `/axtrapost`, `/axtraprof`, `/profile` | client | Social-style feed / profile (peripheral) |
| `/reportenfrasys{april,june}2025` | any | Hardcoded showcase reports |

---

## 11. Notifications

`sendNotification()` in `AxtraClientLogics.js` is a **stub** — it only `console.log`s. The TODOs for
Firestore/email/WhatsApp delivery are present but not implemented. Real notifications today are just
**live Firestore listeners** on the dashboards:
- **Agency dashboard** watches: `revisions` (`status: Submitted`), `contentOrders` (`Pending`),
  `invoices` (`Sent`).
- **Client dashboard** watches: `revisions`, `contentSubmissions`, `invoices`, `reports` for their
  own `clientEmail`.

---

## 12. Gotchas worth knowing

1. **Two draft-submit paths set different statuses** (`/agency-content-planner` → `completed` vs
   `/axtraspace` → `awaiting_approval`). The client UI only treats `awaiting_approval` as a new-draft
   notification.
2. **`billing` vs `invoices` collection mismatch** — uploads land in `billing`; dashboards read
   `invoices`. Invoice notifications/listing can silently miss data.
3. **Doc-ID format fragility.** `contentSubmissions`/`contentDirections` use `{email}_{contentId}`.
   `approveContent()` tries *three* ID formats and a fallback query because historical docs used
   inconsistent IDs — and there's bespoke parsing to recover `C6` from malformed IDs.
4. **Everything is `clientEmail`-keyed and lowercased.** Domain↔email mapping
   (`EMAIL_TO_DOMAIN_MAP`) exists so Gmail-based client logins (e.g. `freewillauto@gmail.com`) map to
   their real domain config.
5. **Clients & deliverables are hardcoded** in multiple files — onboarding a client means editing
   `CLIENT_CONFIG`, the `CLIENTS` arrays, and `EMAIL_TO_DOMAIN_MAP`.
6. **No server.** Static export means all access control is Firestore Security Rules
   ([`firestore.rules`](../firestore.rules), [`storage.rules`](../storage.rules)) — the UI's
   role checks are convenience only.
```
