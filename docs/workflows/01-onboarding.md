# Workflow 01 — Onboarding / Info Collection (P0 wedge)

## Trigger
`deals.stage` transitions to `paid` (Stripe webhook → Supabase update).

## Steps

| # | Trigger | Action | System |
|---|---|---|---|
| 1 | `deal.paid` | Insert `projects` row + default `project_phases` from service template | Supabase trigger |
| 2 | `project.created` | n8n fetches `onboarding_template` by `service_id`; calls Claude to lightly customise wording for the client's industry (pulled from lead notes) | n8n + Claude |
| 3 | Form ready | Insert `onboarding_forms` row, generate magic-link portal URL, send via Resend | n8n + Resend |
| 4 | Client opens portal | Magic-link auth (Supabase), render form from `schema_json` | Next.js |
| 5 | Each field saved | Upsert `onboarding_submissions`, recompute `completion_pct`, realtime broadcast | Supabase |
| 6 | Idle 48h | Reminder email + Telegram nudge to Closer | n8n cron |
| 7 | Form submitted | Claude reads all answers + uploaded files (vision for logos/brand) → produces structured brief: target audience, brand voice, must-haves, references, deliverables list | n8n + Claude |
| 8 | Brief ready | Auto-create `tasks` per role (UIUX/FE/BE) with due dates derived from `default_duration_days`; post brief link to team Telegram | n8n |

## Inputs
- `onboarding_templates.schema_json` (Website template seeded from [website-creation.md](../onboarding-checklists/website-creation.md))
- Client industry from `leads.notes`
- Service-level defaults

## Outputs
- Completed `onboarding_forms` (status=`processed`)
- Structured brief stored on the `projects` row (`brief_md` column)
- Tasks ready in team kanban
- Telegram message: "🚀 New brief ready: {client} — {service}"

## Edge cases
- Partial submission: never trigger brief; reminder cycle continues.
- Missing legal docs: AI flags in brief, generates draft Privacy Policy / T&C if client chose "Please generate".
- Logo missing: brief flags as blocker; UIUX phase cannot start.
