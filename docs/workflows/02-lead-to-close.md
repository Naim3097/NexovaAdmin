# Workflow 02 — Lead → Close (P0)

## Trigger
New row in `leads` (from website form, ad landing page, or manual entry).

## Steps

| # | Trigger | Action |
|---|---|---|
| 1 | `lead.created` | n8n calls Claude with lead details → returns `ai_score` (1–10) + reasoning |
| 2 | `score >= 6` | Auto-assign to Closer (round-robin), Telegram ping, draft first reply email |
| 3 | `score < 6` | Drop into nurture queue (drip email sequence) |
| 4 | Closer sends draft | Outbound logged in `activity_log` |
| 5 | Cal.com webhook: booking | Update `lead.status = consult_booked`, send prep doc to Closer |
| 6 | Closer marks `won` | n8n generates contract PDF (HTML template + service details) |
| 7 | Contract ready | Stripe payment link created, contract + link emailed to lead |
| 8 | `stripe.payment.succeeded` | Update `deal.stage = paid`, promote `lead → client`, kick off **Workflow 01 — Onboarding** |
| 9 | Lost | Reason captured, moved to lost-leads list for re-engagement after 90 days |

## Outputs
- Closer kanban always reflects reality
- Every won deal triggers onboarding automatically — zero manual handoff
- Source attribution preserved end-to-end (lead → deal → revenue)
