# n8n Workflows

Export workflows from your n8n instance and commit the JSON here. One file per workflow.

## Planned workflows

| File | Trigger | Purpose |
|---|---|---|
| `lead-created.json` | Webhook from website / Supabase row insert | AI score + assign + Telegram |
| `deal-paid.json` | Stripe webhook | Promote lead → client → create project → trigger onboarding |
| `onboarding-generate-form.json` | `project.created` | Claude customises template → email portal link |
| `onboarding-process-submission.json` | `form.submitted` | Claude summarises → brief → tasks → Telegram |
| `ads-sync-metrics.json` | Cron hourly | Pull Meta/Google/TikTok metrics → Supabase |
| `client-weekly-report.json` | Cron weekly | Generate PDF → email client |
| `invoice-dunning.json` | Cron daily | Chase overdue invoices |

## Conventions

- Use Supabase service-role node only inside n8n (never client-side).
- Tag every workflow with the priority (`P0`, `P1`, `P2`).
- Name nodes clearly: `Get Lead`, `Score with Claude`, not `HTTP Request 4`.
