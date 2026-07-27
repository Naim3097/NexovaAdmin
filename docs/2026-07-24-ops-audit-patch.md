# Operations Audit & Optimization — Patch 2026-07-24

> Audit of Nexova Digital operations: the "How We Work" playbook (Jul 2026) tested
> against live Nexov Admin production data (7 team · 10 client records · 87 content
> items · 8 projects · 8 invoices · 200 recent events). Full styled report:
> https://claude.ai/code/artifact/9c9b34f9-552f-4e3f-88e4-5110832fb81d

**Verdict:** the operating system is built; the company isn't running on it yet.
Playbook lanes are clean, but most operational truth still lives in heads, chats,
and slides. The fastest wins are wiring the existing business into the existing
engine — not new features.

---

## 1 · Headline findings

| # | Finding | Evidence |
|---|---|---|
| 1 | Billing engine fully built, fully unarmed | 0/10 clients have a retainer amount; 5/8 invoices ever created are still draft; extras pricing mostly unset |
| 2 | Sales pipeline lives outside the IMS | 2 leads recorded vs 11 active accounts; no "deposit received" stage despite it being the closing rule; 1 quotation ever |
| 3 | Client directory drift | Enfrasys has a 15/mo project + 20+ content items but **no client record**; Tropicor, Fynecta, Belumgo exist on slides only |
| 4 | Accountability features shipped, unused | 0 stage due dates across 8 projects (deadline bot has nothing to chase); 0/87 content items have an assignee; sprint tasks used by one PIC (Bob) |
| 5 | Role data corrupts auto-assignment | 5/7 team roles mislabeled (CEO/Closer/Frontend/Backend/PM/Other vs playbook Sales/Admin/Ops/Creative/Production); "Danisy Test 2" auto-assigned as PIC nearly everywhere; Zafran has **no login** |
| 6 | The declared bottleneck | Playbook footer: *"production requests always flow through Danisy"* — dispatcher, QC, and sole system operator in one person |
| + | What works | LZS review loop is real: 23 draft submissions, 6 change requests, 5 approvals, 19 stage advances in recent events. Where the system is used, it works |

## 2 · Playbook vs reality (gap table)

| Playbook says | System shows | Severity |
|---|---|---|
| 11 active clients, each with exactly one AM | 10 client records; **no AM field exists** — AM lives on slide 3 only | CRIT |
| Sales: Lead → Qual → Presentation → Quotation → Closed → **Deposit** | 2 leads total; no deposit state; quotations barely adopted | CRIT |
| Admin: issue invoice → folder → agreement → notify Ops | 8 invoices ever (5 draft) vs ~10 monthly retainers; folders/agreements have no system home | CRIT |
| 7 people, 7 clear roles | 5/7 roles mislabeled; auto-assignment mis-routes | HIGH |
| Ops: Kickoff → Strategy → Production → QC → Approval → Live → Report | Pipelines exist on all 8 projects but sit at 0–1/5 done, no due dates — set up then not maintained | HIGH |
| AM sends weekly client update (slide 13 template) | No mechanism; the data to auto-draft it already exists | HIGH |
| Every campaign ends in renewal/upsell | No renewal date/package-end anywhere; renewals are memory-based | HIGH |
| Zafran: ads/website/SEO | Only member with no login; his modules near-zero usage | MED |

## 3 · Function scorecard

| Function | Grade | Biggest gap |
|---|---|---|
| Content delivery (Bob, Pokjak) | B+ | 83/87 items nowhere in review; 0 assignees |
| Client management (AMs) | C− | AM not in system; weekly update manual; renewals untracked |
| Sales (Naim, Hakim) | C− | Pipeline in chats; no deposit stage; won→client handoff manual |
| Finance/Admin (Farisha) | D | Engine unarmed: no retainers configured, drafts stuck, LeanX KYC + Resend domain pending |
| Project delivery (Danisy) | C+ | Stages stale, no due dates, mis-routed PICs |
| Internal tasking | C | Sprint tasks adopted by one PIC; task-request SOP not routed here |
| Access & security | C | All staff see everything incl. finances; no 2FA; one member accountless |

## 4 · Risk register

1. **SPOF — Danisy** as dispatcher + QC + sole system operator (playbook admits it).
   Mitigate: sprint-task routing, PIC deadlines, train Farisha as second admin.
2. **Revenue leakage** — billing configured nowhere; nobody can answer "what should
   we have billed this month?" from data.
3. **Directory drift** — anything not in the client directory is invisible to
   quotas, billing, reports, portal.
4. **Deposit-before-work is policy, not process** — system can't represent it.
5. **Professional surface** — emails from `onboarding@resend.dev`; FPX links await
   LeanX KYC (nexops.my is live; Resend DNS is the only missing step).
6. **Flat access** — fine at 7 trusted people; liability at hire #8. Enforce before then.

## 5 · Recommendations (ranked)

| # | Rec | Pri | Effort | Owner |
|---|---|---|---|---|
| 1 | **Data-hygiene sprint:** add 4 missing clients; set retainer/quota/extras/package for all; fix 5 team roles; rename "Danisy Test 2"; create Zafran login | P0 | S | Danisy + Farisha |
| 2 | **Arm billing:** run monthly auto-invoice for every retainer client; clear 5 draft invoices | P0 | S | Farisha |
| 3 | **AM field on client record** + surfaced on profile/board/reports | P0 | M | build |
| 4 | **Auto-drafted Weekly Client Update** (slide 13 from live data; AM edits + sends) | P0 | M | build |
| 5 | Route "internal task requests" through Sprint Tasks (PIC + deadline; bot chases) | P1 | S | process |
| 6 | Stage due dates as kickoff SOP + extend bot to ping overdue stages | P1 | M | process + build |
| 7 | Portal rollout wave: next 3 review-heavy clients | P1 | S | AMs + Farisha |
| 8 | Deposit stage: won → auto deposit invoice → kickoff unlocks on paid | P1 | M | build |
| 9 | Resend domain verify (noreply@nexops.my) + LeanX KYC + webhook | P1 | S | Danisy (external) |
| 10 | Renewal tracking: package dates + 30-day Telegram ping | P2 | M | build |
| 11 | Content assignees as habit (field exists, 0/87 used) + board filter | P2 | S | process |
| 12 | Role-based access: finance restricted; do before headcount 8 | P2 | L | build |

## 6 · Flagship automation — the weekly update writes itself

Slide 13's template is a query, not a chore. Mapping:
- **Completed this week** = approvals + posted (last 7d)
- **In progress** = drafts in flight + active stages
- **Waiting for** = `awaiting_client` items + unpaid invoices
- **Next week** = scheduled items (next 7d)
- **Issues/risks** = quota overage (billable visuals) + overdue invoices

One click per client per week; AM adds one human line and sends.

## 7 · SOPs to write (one page each)

1. Client onboarding (Farisha) — won lead → deposit invoice → client record w/ retainer/quota/AM → portal invite → kickoff
2. Weekly AM cadence (each AM) — Mon generate+chase, Thu send+book
3. Content production (Bob/Pokjak) — direction → headline → draft → revise ≤ limit → approved → posted; who sets assignee
4. Internal task requests (all) — Sprint Tasks vs project stage; 3-day default deadline
5. Invoicing & collections (Farisha) — auto-invoice day, send day, reminder cadence off A/R aging
6. Client offboarding (Farisha) — churn → portal revoked → final invoice → handover (LZS contact swap = first draft)
7. System admin basics (Danisy → Farisha) — invites, resets, contact changes

## 8 · Org

Keep the 7-person shape. Encode it: correct roles in system (truthful
auto-assignment), AM-per-client as data, and relax "flows through Danisy" into
"flows through Sprint Tasks, triaged by Danisy" — a control point, not a bottleneck.

## 9 · Roadmap 30/60/90

- **Week 1 (no code):** data-hygiene sprint · clear drafts + first auto-invoices ·
  portal wave · task-request routing agreed · Resend DNS
- **Weeks 2–4:** AM field · auto weekly update · stage due-date SOP + overdue pings ·
  LeanX KYC done
- **Days 30–60:** deposit stage · renewal tracking · content assignees habitual ·
  first fully in-system billing month
- **Days 60–90:** role-based access · second system admin trained · quarterly
  re-audit (gap table §2 should read near-zero)

**90-day definition of done:** a client can be sold, deposited, onboarded, produced,
reviewed, billed, reported, and renewed with every step leaving a system trace —
and with Danisy away for a week, none of it stops.

---

## Delivered in this patch (2026-07-24 — local working tree, unpushed)

| Rec | What shipped | Where |
|---|---|---|
| #3 | **Account manager on clients** — dropdown on client profile (team members), shown in header + clients list | client profile/list · migration `0021_account_manager.sql` |
| #4 | **Auto Weekly Client Update** — slide-13 template drafted from live data per client (completed / in-progress / waiting-for w/ review age + unpaid invoices / next-week / issues incl. billable quota overage), WhatsApp-ready Copy button | `/reports/weekly` (linked from Reports) |
| #6 | **Deadline bot extended** — daily cron now also pings project stages due tomorrow/today (PIC named) alongside sprint tasks | `/api/cron/task-reminders` |
| #8 | **Deposit invoice from a won lead** — "Create deposit invoice" on the lead: draft invoice @ 50% of est. value, editable, lands on the invoice; audit-trailed | lead detail → Actions |
| #10 | **Renewal tracking** — `packageRenewsOn` date on client (Service package section), "Renewals ≤ 30d" dashboard tile, Telegram pings at 30d / 7d / day-of | client profile · dashboard · cron · migration `0022_renewals.sql` |
| #12 | **Role-based access** — per-member access level (`admin` / `standard`, set on Team → member). Standard users: no invoices/quotes/financial reports/CSV exports/agency settings/team pages (server-side guards + honest nav; mobile nav swaps Invoices→Tasks). Bootstrap-safe: until one active admin is set, everyone has full access | migration `0023_access_levels.sql` · lib/auth `getAccessLevel`/`requireAdminAccess` |

**Pending to activate:** apply migrations **0021 + 0022** in Supabase SQL editor
(client profile saves write the new columns and will error until applied; all
views + weekly updates work read-only meanwhile).

**Still open from the rec list:** #1–#2 (data-hygiene + arm billing — founder
task, no code), #5/#7/#11 (process adoption), #9 (Resend DNS + LeanX KYC),
#12 (role-based access — build later, before headcount 8).

---

## Update 2026-07-25 — data-hygiene executed + SOPs drafted

Migrations 0021 + 0022 applied (0023 access-levels still pending). Staging live
at staging.nexops.my. Executed directly against production data:

**Rec #1 — data-hygiene sprint (done except billing amounts):**
- Team roles fixed to drive truthful auto-assignment: **"Danisy Test 2" →
  Danisy (PM)**, Bob PM → **Content**, Pokjak Other → **UI/UX**, "hakim" →
  **Hakim**. All 7 project-stage PIC references to the old name swept to
  "Danisy"; lead assignees swept too.
  *(Corrected 2026-07-25: the playbook's "Zafran: ads/website/SEO" is wrong —
  **Zafran is a backend dev** (role stays Backend); **ads/website/SEO are
  Danisy's lanes**, recorded in Danisy's skills.)*
- 4 missing clients created: **Enfrasys** (contact Mior Nasrulah), **Tropicor**,
  **Fynecta**, **Belumgo** — active shells; package/retainer to be filled (#2).
- **Account managers set per playbook slide 3:** Naim → Lean.x, Nexova,
  Payright MY, KALIMA, Fynecta · Hakim → MNA, Nanorev, Belumgo · Danisy →
  Tropicor · Pokjak → Enfrasys · Bob → Lembaga Zakat Selangor. (BYKI,
  Temenggor, Benefigs not on slide 3 — founder to assign.)
- **Zafran login minted** (zafrang@gmail.com, linked to his team row,
  set-password link handed to founder).
- Note: the founder's working login (danisyamldn@gmail.com) is attached to the
  now-renamed **Danisy** team row — the old dummy "Client Testing" client was
  deleted, so the collision is gone. Link real emails before setting admins.

**SOPs (§7) — all 7 drafted** in `docs/sops/` (01-client-onboarding …
07-system-admin-basics + README index).

### Completion scoreboard

| Rec | Status | % |
|---|---|---|
| #1 Data-hygiene sprint | Roles/renames/sweeps/clients/AMs/Zafran done; retainer & quota amounts still unset | 80% |
| #2 Arm billing | Not started — needs founder's retainer/extras figures + first invoice run | 0% |
| #3 AM field | Shipped + data populated | 100% |
| #4 Auto weekly update | Shipped (/reports/weekly) | 100% |
| #5 Task-request routing | SOP 4 written; adoption pending | 50% |
| #6 Stage deadline pings | DONE 2026-07-25 — bot shipped + 24 open stages dated + PICs corrected (Temenggor/BYKI intentionally undated) | 100% |
| #7 Portal rollout wave | Not started (process) | 0% |
| #8 Deposit invoices | Shipped (lead → deposit invoice); SOP 1 encodes deposit-before-work | 100% |
| #9 Resend DNS + LeanX KYC | External, pending founder | 0% |
| #10 Renewal tracking | Shipped; renewal dates not yet entered per client | 80% |
| #11 Content assignees habit | Backfilled 87/87 per playbook lanes (2026-07-25: 86 design→Pokjak, 1 reel→Bob); SOP 3 written; habit pending | 80% |
| #12 Role-based access | DONE 2026-07-25 — 0023 applied, admins Danisy/Naim/Farisha, others standard | 100% |
| §7 Seven SOPs | All 7 drafted | 100% |

**Overall: ~75% of the audit's rec list delivered** (builds 100% complete;
remaining weight is founder-side data entry, external services, and process
adoption — nothing left blocked on code except applying migration 0023).

### Decision data pulled 2026-07-25 (for the founder)

**Rec #2 — the 5 stuck draft invoices** (send, edit, or void):
INV-2026-0001 Burger Bakar Zam RM 8,500 (Jun 15) · INV-2026-0004 Danisy Auto
RM 5,500 (Jun 18) · INV-2026-0007 LZS RM 23,000 (Jun 22) · INV-2026-0009 MNA
RM 1,500 (Jul 31) · INV-2026-0010 Lean.x RM 6,849.33 (Jul 1).

**Rec #7 — portal wave candidates** (most content, no login): Lean.x (8),
Nexova (8), Payright MY (8), then MNA (4). None have a contact email on record
yet — add emails, then invite.

**Rec #6 — 32 open stages undated across all 8 projects**; several stage PICs
still reflect the old corrupted auto-assignment (e.g. Creative Design→Danisy,
Schedule & Post→Zafran on Payright/BYKI/Nexova) — worth a 10-minute sweep when
setting due dates. Future projects route correctly now that roles are fixed.

### Update 2026-07-25 (later) — 0023 live, admins set, cleanup

- **Migration 0023 applied; rec #12 COMPLETE.** Admins: **Danisy, Naim,
  Farisha**. Bob, Pokjak, Hakim, Zafran are now `standard` (no
  finance/team/exports — reversible per member on Team pages).
- **Dummy invoices removed** per founder: INV-2026-0001 (Burger Bakar Zam,
  RM 8,500), INV-2026-0004 (Danisy Auto, RM 5,500). Real drafts remaining:
  LZS RM 23,000 · MNA RM 1,500 · Lean.x RM 6,849.33 — founder to tag each
  paid-outside / still-owed / void.
- **Internal entities tagged** on client notes: Lean.x, Nexova, Payright MY are
  Nexova-group entities — no client portal needed; portal wave (#7) retargets
  external clients (MNA next; needs contact email).
- **Name-variant merge:** 21 content items (and any rows in
  projects/invoices/quotations/campaigns) filed under "Zakat Selangor" merged
  into **"Lembaga Zakat Selangor"** — they were invisible to quota, portal and
  weekly updates. LZS now correctly shows 50 content items. (The audit's
  "Enfrasys 20+ items" was this misfiled batch.)
- **Project triage resolved (founder tags): all 8 projects are REAL.**
  Executed same day:
  - Stage due dates set (weekly stagger from Aug 1) on LZS, MNA, Payright,
    Nexova, Lean.x; **Enfrasys staggered from Aug 7** (system start in Aug per
    founder). 24 open stages now dated — the deadline bot has work.
  - PIC corruption fixed on open stages: Creative Design → Pokjak,
    Schedule & Post → Bob (was Danisy/Zafran from the old broken roles).
  - **BYKI → on_hold** (real client, engagement paused). **Temenggor** real but
    not started — left undated until kickoff.
- **Invoice dispositions (founder):** LZS RM 23,000 + Lean.x RM 6,849.33 still
  owed → dates refreshed (issued 2026-07-25, due 2026-08-01), drafts ready for
  Farisha to send. MNA RM 1,500 paid but amount changed — held as draft until
  founder confirms the final figure.
- **Directory truth pass (founder tags):** BYKI is also an internal Nexova-group
  entity (tagged; no portal/AM needed). Temenggor AM → **Naim**. **Benefigs is
  NOT a client yet** — still an unwon lead: record set to `prospect` status with
  a note; its pipeline lead already exists. AM coverage is now complete for
  every real external client.

## Readiness audit 2026-07-25 — "can the system accommodate every workflow step?"

Verified end-to-end against code + production DB (all 20 tables respond;
USE_SUPABASE=1 → every entity on Supabase; all 17 admin surfaces + portal +
print routes present; quotation engine, invoice engine incl. LeanX links +
manual payments, reports incl. weekly/CSV/A-R, content pipeline, sprint tasks,
campaigns, SEO, notifications, audit trail, access levels — all real).

Four gaps found, **all fixed same day** (commit 4009ca1):

1. **Monthly retainer generator was missing** (SOP 5 step 1 had no button) →
   built: Invoices → "Generate retainer invoices" drafts one invoice per active
   client with a retainer set, adds a quota-overage extras line automatically,
   idempotent per month.
2. **No automatic overdue flip** (SOP 5's ladder assumed it) → daily cron now
   flips sent → overdue past due date + Telegram ping.
3. **Stage auto-assignment mismatch**: default templates referenced roles
   nobody holds after the re-roling (Frontend/Ads/SEO) → template overrides
   seeded in DB per real lanes (Danisy = web/ads/SEO stages, Zafran = backend
   stages). All service categories now auto-route to real people.
4. **No portal revoke** (offboarding SOP 6 step 3 had no button) → built:
   client profile → "Revoke portal access" (unlinks login; data kept;
   re-invite relinks).

Bonus find: the audit_events entity constraint was missing 'quotation' since
0007 — **quotation audit rows have been silently dropped** (recordAudit is
deliberately non-fatal). Migration **0024_audit_entities.sql** fixes the
constraint (adds quotation/content/client). Until applied, portal-revoke and
quotation audits are skipped silently; everything else unaffected.

## Remaining for 100% (as of 2026-07-25 — nothing left blocked on build)

**A. Founder inputs — Claude executes same day they arrive:**
1. Retainer / monthly quota / extras pricing / package name per client
   (closes recs #1 and most of #2). Priority: LZS, MNA, Enfrasys, Tropicor,
   Fynecta, Belumgo, Temenggor + internal entities if they bill internally.
2. MNA invoice INV-2026-0009: confirmed final amount (money already received)
   → set figure, mark sent + paid.
3. MNA contact email → portal invite (rec #7's first external wave).
4. Renewal dates (`package renews on`) per client → rec #10 pings go live.
5. Temenggor kickoff date → its 4 open stages get due dates.

**B. Founder-only external actions:**
6. Resend custom-domain DNS (noreply@nexops.my) — deferred by founder.
7. LeanX KYC → FPX payment links on invoices.
8. Share Zafran's set-password link — deferred by founder.
9. Farisha sends the two refreshed drafts (LZS RM 23,000, Lean.x RM 6,849.33).

**C. Adoption (proves itself over the next cycles; SOPs + tooling all live):**
10. AMs run SOP 2 (Mon generate/chase, Thu send) for one full week.
11. Team routes requests through Sprint Tasks (SOP 4) instead of WhatsApp.
12. Content lights + assignees maintained per SOP 3 (backfill done; habit next).
13. First fully in-system billing month (follows automatically from A1 + B9).

## Team briefing — what changed (founder: share/adapt this)

**Access.** The system now has admin and standard access. Naim, Danisy and
Farisha are admins. Everyone else sees delivery surfaces (dashboard, projects,
content, tasks, weekly updates) — finance and team admin are admin-only. If a
page you need disappeared, tell Danisy.

**Roles fixed.** Danisy = PM (also owns ads/website/SEO), Bob = Content,
Pokjak = UI/UX, Zafran = Backend. Auto-assignment now routes by these, so new
work lands on the right person. Zafran gets a login this week.

**Every client has one AM.** The AM field is on each client profile and shown
on the clients list. AM owns the weekly update and the renewal conversation.

**Weekly updates write themselves.** Reports → Weekly updates: pick your
client, the Mon/Thu routine is SOP 2. Copy, add one human line, send.

**Deadlines are now real.** Project stages have due dates and a Telegram bot
chases them (tomorrow + day-of), same as sprint tasks. If a date is wrong,
change it on the project — don't ignore the ping.

**Content cards: keep the four lights honest.** Direction → Headline → Draft →
Approved. Every card now has an assignee (video → Bob, design → Pokjak —
reassign if wrong). Client review happens in the portal, never over WhatsApp.

**Requests go on the board.** Anything you'd WhatsApp Danisy for becomes a
Sprint Task with a PIC and a deadline (default 3 days). Danisy triages daily.

**SOPs live in `docs/sops/`** — 7 one-pagers: onboarding, weekly AM cadence,
content production, task requests, invoicing, offboarding, system admin.
