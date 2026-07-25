# SOP 7 — System Admin Basics

**Owner:** Danisy (training Farisha as second admin — the audit's #1 risk is
Danisy as single point of failure)

## Invite a teammate

Team page → invite with name, email, role. The system returns a one-time
set-password link — share it via WhatsApp. Their **role** matters: it drives
auto-assignment (PM = project stages, Content = content cards, etc.), so pick
the real function, not a title.

## Invite a client to the portal

Client profile → portal access → invite with the client's email. Share the
set-password link. They log in at nexops.my → **Client Login**.

## Reset a password

Same invite button on the person's page — if the account exists it issues a
fresh set-password link instead of erroring. Works for team and clients.

## Change a contact's email (client-side person swap)

Ask Danisy/Claude-ops to update the auth email on the existing user (keeps all
dashboard history — this is how LZS moved from Ain to Sharafi). Never create a
second account for the same client seat.

## Access levels (once migration 0023 is applied)

Team member page → **Access**: `admin` (everything) or `standard` (no finance,
team, or exports). Until at least one active admin is set, everyone has full
access — so the first act is setting the real admins (Naim, Danisy, Farisha).
**Before doing this, confirm each admin's login email is linked to their team
row** — an unlinked login drops to standard.

## Rules

- Two people must be able to do everything on this page. If only Danisy can,
  this SOP has failed.
- Never share the service key or Supabase dashboard access; everything above is
  doable from the app.
