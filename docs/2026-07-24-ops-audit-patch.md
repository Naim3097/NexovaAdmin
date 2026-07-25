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
  Danisy (PM)**, Bob PM → **Content**, Pokjak Other → **UI/UX**, Zafran
  Backend → **Ads**, "hakim" → **Hakim**. All 7 project-stage PIC references
  to the old name swept to "Danisy"; lead assignees swept too.
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
| #6 Stage deadline pings | Bot shipped; kickoff SOP written; due dates still unset on existing projects | 70% |
| #7 Portal rollout wave | Not started (process) | 0% |
| #8 Deposit invoices | Shipped (lead → deposit invoice); SOP 1 encodes deposit-before-work | 100% |
| #9 Resend DNS + LeanX KYC | External, pending founder | 0% |
| #10 Renewal tracking | Shipped; renewal dates not yet entered per client | 80% |
| #11 Content assignees habit | SOP 3 written; adoption pending | 50% |
| #12 Role-based access | Code shipped; migration 0023 + admin designation pending | 80% |
| §7 Seven SOPs | All 7 drafted | 100% |

**Overall: ~62% of the audit's rec list delivered** (builds ~95% complete;
remaining weight is founder-side data entry, external services, and process
adoption — nothing left blocked on code except applying migration 0023).
