# Supabase Setup — Manual Steps

These can't be checked into code; they're clicks in the Supabase dashboard.
Re-do them for every Supabase project (local / staging / production).

**Project ref:** `gdinummzvbwjfdesqfpt` (development)

---

## 1. Apply database migrations

Apply in numeric order from `supabase/migrations/`:

1. `0001_init.sql` — creates 15 tables + RLS policies.
2. `0002_user_permissions.sql` — adds the permissive `user_has_permission` function.

**Two ways:**

**A. Dashboard SQL Editor** (no CLI needed):
- Open https://supabase.com/dashboard/project/gdinummzvbwjfdesqfpt/sql/new
- Paste each file in turn, click **Run**.
- If you see `relation already exists`, drop everything first with the block in
  `supabase/migrations/README.md` (or ask Claude for the drop script).

**B. CLI:**
```powershell
scoop install supabase    # one-time
supabase link --project-ref gdinummzvbwjfdesqfpt
supabase db push
```

Verify: 15 tables in **Database → Tables**.

---

## 2. Auth — URL configuration

Open: https://supabase.com/dashboard/project/gdinummzvbwjfdesqfpt/auth/url-configuration

| Setting | Value (development) |
|---|---|
| **Site URL** | `http://localhost:3001` |
| **Redirect URLs** | `http://localhost:3001/auth/callback` |

When deploying to a real domain, ADD (don't replace) these for that env:
- `https://nexovadmin.com`
- `https://nexovadmin.com/auth/callback`
- (and any staging URL)

Magic-link emails will fail silently if these URLs aren't allow-listed.

---

## 3. Auth — Email provider

Open: https://supabase.com/dashboard/project/gdinummzvbwjfdesqfpt/auth/providers

- **Email**: must be **Enabled** (default).
- **Confirm email**: can stay enabled — magic links require it.

**Free tier limits:**
- Sent from `noreply@mail.supabase.io`.
- Rate limit ≈ 4 emails / hour.
- Often goes to spam.

For production, replace with custom SMTP (e.g. Resend) in
**Auth → Email Templates → SMTP Settings**.

---

## 4. Environment variables that depend on this setup

In `app/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://gdinummzvbwjfdesqfpt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from Project Settings → API>
SUPABASE_SERVICE_ROLE_KEY=<service_role key — server only, never expose>
NEXT_PUBLIC_SITE_URL=http://localhost:3001   # must match Auth → Site URL
DEV_AUTH_BYPASS=1                            # off for real-login testing
USE_SUPABASE=1                               # 1=all, 0=dev-store, or comma list
```

---

## 5. Restoring (if something is missed)

| Symptom | Likely cause |
|---|---|
| Magic link email never arrives | Email provider disabled, or rate-limited |
| Click magic link → redirected to `/login?error=auth` | Callback URL not in Redirect URLs list |
| Login looks logged-in then logged-out on refresh | `Site URL` wrong, or `NEXT_PUBLIC_SITE_URL` mismatched |
| Health endpoint says `db: error` | Migrations not applied |
| `relation "agency_profile" does not exist` | Same — apply `0001_init.sql` |
| Onboarding form submit silently fails / stays "draft" | Server Action body limit too low. See `experimental.serverActions.bodySizeLimit` in `app/next.config.ts` (default 1MB, we raised to 50mb). |
| `AI summary failed: ... 503 UNAVAILABLE` | Gemini overload; auto-retries once, otherwise click Regenerate. |
