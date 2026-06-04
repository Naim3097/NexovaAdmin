# Pending production setup

Things that work in development but need real configuration before going live.
Tick them off as you tackle each one.

---

## Database — apply migration 0004 + seed

**Status:** ⏳ pending.

1. Apply `supabase/migrations/0004_team_auth_link.sql` (Dashboard SQL editor or
   `supabase db push`). It adds `team_members.user_id` so logins link to team
   records. Without it, the invite flow's link step fails.
2. Apply `supabase/migrations/0005_project_workflows.sql`. Adds
   `projects.service_category` + `projects.stages`, the `workflow_templates`
   table, and the `stage_advanced` notification kind. **Required before
   creating/converting projects** — new project rows write these columns, so
   project creation errors until this is applied.
3. From `app/`, run `npm run seed` once. Idempotent: seeds the 9 Nexova services
   and fills the agency display/legal name. Then finish SST no. + bank details in
   **Settings → Agency** so invoices render a complete header.

---

## Team accounts — invite flow

**Status:** ✅ works now via copyable link; auto-email optional.

How to add a staff member: **Team → Invite team member** (name, email, role).
The system creates their Supabase auth user, links it to a `team_members` row,
and shows a **one-time set-password link**. Copy it and send it to them (e.g.
WhatsApp); they open it, choose a password, and land in the app. After that they
sign in with email + password at `/login`.

To have invites **auto-email** instead of copy-paste, configure **Supabase Auth
SMTP** to use Resend:
- Supabase dashboard → **Authentication → Emails → SMTP Settings** → enable custom
  SMTP, host `smtp.resend.com`, port 465, user `resend`, password = your Resend
  API key, sender = an address on your verified domain.
- This also fixes password-reset emails. Until it's set, the copyable link is the
  reliable path.

---

## Telegram — bot setup

**Status:** ⏳ pending creds.

**What to do:**

1. Open Telegram → search **@BotFather** → `/newbot` → name + username → copy token.
2. Pick where alerts land:
   - **Personal chat:** start a chat with your new bot, send "hi", then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` → grab `chat.id` (positive number).
   - **Group chat:** create group → add the bot → send a message → same `getUpdates` URL → use the **negative** `chat.id`.
3. Add to `app/.env.local`:
   ```env
   TELEGRAM_BOT_TOKEN=1234567890:ABC...
   TELEGRAM_TEAM_CHAT_ID=<chat id>
   ```
4. Restart dev server → visit `http://localhost:3001/api/telegram/test` → confirm a test message lands in the chat.

Notes:
- The bot needs to be added as a member of any group it should post in.
- For privacy: enable "Group Privacy: OFF" on the bot via BotFather (`/setprivacy`) ONLY if you want it to also read messages. For one-way alerts this isn't needed.
- To swap chats later (e.g. move from personal test chat to team group), just change `TELEGRAM_TEAM_CHAT_ID` and restart.

---

## Payments — LeanX setup

**Status:** ⏳ pending. Code is wired and webhook route is ready, but no API keys.

**What to do:**

1. Sign up at **https://leanx.io** as a merchant. KYC may take a day or two.
2. In Merchant Portal:
   - Navigate to **API** page → copy the three components of the `auth-token`. The full value looks like `LP-<MERCHANT_ID>-MM|<UUID>|<TOKEN>`. Copy verbatim.
   - Create a **Collection** for Nexov Admin → copy its UUID.
   - On the same API page, find the **HASH_KEY** (used to sign webhook JWTs).
3. In `app/.env.local` add:
   ```env
   LEANX_API_BASE=https://api.leanx.dev          # sandbox; switch to https://api.leanx.io for prod
   LEANX_AUTH_TOKEN=LP-XXXX-MM|UUID|TOKEN
   LEANX_COLLECTION_UUID=<your collection UUID>
   LEANX_HASH_KEY=<your hash key>
   ```
4. In LeanX Merchant Portal, set the **Callback URL** on your collection to:
   - For local dev: tunnel localhost via ngrok (`ngrok http 3001`) and use `https://<id>.ngrok.app/api/webhooks/leanx`
   - For production: `https://nexovadmin.com/api/webhooks/leanx`
5. Apply migration `0003_invoice_payment.sql` to your Supabase (Dashboard SQL editor or `supabase db push`).
6. Test end-to-end: create an invoice with line items → "Generate payment link" → open it in incognito → complete sandbox payment → confirm invoice flips to "paid" and a notification fires.

When you go live: switch `LEANX_API_BASE` to `https://api.leanx.io` and rotate to your production credentials.

---

## Email — Resend custom domain

**Status:** ⏳ pending. Currently using Resend test mode (`onboarding@resend.dev`).

**What to do:**

1. Pick the sending domain. Recommended: `nexovadigital.com` (clients recognize it).
2. In Resend dashboard → **Domains → Add Domain** → enter the domain.
3. Resend shows DNS records to add (typically):
   - `SPF` — TXT record at root: `v=spf1 include:_spf.resend.com ~all`
   - `DKIM` — 3 CNAME records (e.g. `resend._domainkey`)
   - `DMARC` — TXT at `_dmarc`: `v=DMARC1; p=none; rua=mailto:postmaster@yourdomain`
4. Add the records at your DNS host (Cloudflare / Namecheap / wherever the domain lives).
5. Back in Resend → click **Verify**. Status flips to green within minutes (TTL-dependent).
6. In `app/.env.local` (and Vercel for prod), update:
   - `RESEND_FROM="Nexov <noreply@nexovadigital.com>"`
7. Hit the **mail-tester.com** test (Resend has it built in) — target score: **10/10**. Adjust SPF/DKIM if lower.

Without this, all real emails are routed through `onboarding@resend.dev` which can only deliver to the email address you signed up to Resend with. So you can demo the system but can't actually email clients.

---

## Supabase URL configuration — production URLs

**Status:** ⏳ pending. Currently only `http://localhost:3001` is allowed.

**What to do:**

When you deploy to Vercel:
1. Supabase dashboard → Authentication → URL Configuration.
2. ADD (don't replace) the production URLs:
   - **Site URL:** `https://nexovadmin.com` (or wherever you deploy)
   - **Redirect URLs:** `https://nexovadmin.com/auth/callback`
3. Also add any staging / preview URLs (`https://*.vercel.app` won't work; you have to list specific ones).
4. Mirror to env: `NEXT_PUBLIC_SITE_URL=https://nexovadmin.com` in Vercel env vars.

---

## Server Action body size limit — review

**Status:** raised to 50mb in `next.config.ts` for the onboarding form (logo + photos).

**Review:**
- If switching to direct Supabase Storage uploads (client → Supabase, bypassing the server), drop this back to default (1mb).
- Vercel's serverless functions cap at 4.5mb body anyway for hobby tier, 50mb for pro. Verify your hosting tier supports the limit you set.

---

## DEV_AUTH_BYPASS — must be 0 in production

**Status:** currently `DEV_AUTH_BYPASS=0` in `.env.local`. Already safe.

**Review:** confirm it's `0` (or unset) in Vercel production env. The bypass is force-disabled in production builds via `process.env.NODE_ENV !== "production"` guard, but belt-and-braces — keep the env var off too.

---

## Tighten permissions (later)

**Status:** currently fully open — any signed-in user has access to everything.

**Review:** when you bring on staff with different scopes (e.g. closer should see leads but not edit invoices), replace the no-op `requirePermission()` in `src/lib/auth.ts` with real role checks. The DB function `user_has_permission(uid, perm)` is already in place — just tighten the SQL body and add a `user_roles` table.
