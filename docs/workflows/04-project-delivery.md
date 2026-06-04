# Workflow 04 — Project Delivery (Website) (P1)

## Trigger
Brief generated from Workflow 01.

## Phases (auto-created with owners + due dates)

| # | Phase | Owner | Default days |
|---|---|---|---|
| 1 | Onboarding (info collection) | Closer | 5 |
| 2 | UI/UX Design | UIUX | 7 |
| 3 | Frontend build | Frontend | 10 |
| 4 | Backend integration | Backend | 5 |
| 5 | QA | All | 3 |
| 6 | Draft submission | UIUX | 1 |
| 7 | Amendments | UIUX/FE/BE | 3 |
| 8 | Launch | Backend | 1 |
| 9 | Handover | UIUX | 2 |

## Mechanics
- Each phase `done` → next phase `in_progress`, owner notified.
- Phase blocked → CEO + owner alerted.
- Client portal shows live phase status (read-only).
- Draft submission writes to `content_pieces` with `status=human_review`; client approves via portal.
- Approval webhook → next phase auto-starts.

## Outputs
- Predictable delivery timeline visible to client
- No "what's next?" Slack messages — system tells you
- All approvals captured in `activity_log`
