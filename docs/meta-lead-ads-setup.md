# Meta Lead Ads → NexOps — setup guide

Goal: someone submits a Meta Instant Form → the lead appears in **nexops.my →
Leads** within seconds, status **New**, scored and auto-assigned, with
campaign/ad set/ad recorded in the lead's notes. No Zapier, no Sheets, no
manual CSV downloads.

```
Meta Ad → Instant Form → Meta webhook → POST nexops.my/api/webhooks/meta-leads
        → Graph API fetch (answers) → leads table → /leads (status: New)
```

The receiving code is already in the app
(`app/src/app/api/webhooks/meta-leads/route.ts`). Everything below is
dashboard clicking — no more code.

---

## Part 1 — Meta app (once, ~10 min)

1. Go to **developers.facebook.com → My Apps → Create App**.
2. Use case: **Other** → type **Business**. Name it e.g. `NexOps Leads`.
3. In **App settings → Basic**: connect the app to the **Nexova Business
   Manager** (Business portfolio field), and copy the **App secret** →
   this becomes `META_APP_SECRET`.

## Part 2 — System User token (once, ~10 min)

This is the token the server uses to fetch each lead's answers. A System
User token never expires (a normal user token dies in 60 days — don't use one).

1. **business.facebook.com → Settings (Business settings) → Users → System
   users → Add**. Name `nexops-server`, role **Admin**.
2. Select the system user → **Add assets** → **Pages** → pick the Facebook
   Page the lead ads run from → enable **Full control**.
   Also add the **Ad account** (read access) — this is what lets the lead
   record include campaign / ad set / ad names.
3. **Generate token** → pick the `NexOps Leads` app → tick these scopes:
   - `leads_retrieval`
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_metadata`
   - `pages_manage_ads`
   - `ads_read`
4. Copy the token → this becomes `META_PAGE_ACCESS_TOKEN`.

## Part 3 — Env vars in Vercel (~5 min)

**Vercel → nexops project → Settings → Environment Variables** (Production):

| Name | Value |
|---|---|
| `META_APP_SECRET` | from Part 1.3 |
| `META_VERIFY_TOKEN` | any random string you invent (e.g. 32 hex chars) — you'll paste the same string into Meta in Part 4 |
| `META_PAGE_ACCESS_TOKEN` | from Part 2.4 |

Redeploy after saving (env changes need a redeploy).

## Part 4 — Subscribe the webhook (once, ~5 min)

1. Meta app dashboard → **Add product → Webhooks** → object: **Page**.
2. **Callback URL:** `https://nexops.my/api/webhooks/meta-leads`
   **Verify token:** the exact `META_VERIFY_TOKEN` string from Part 3.
   Click **Verify and save** — Meta sends a GET handshake; the route answers
   it. (Fails? The env vars aren't deployed yet, or the token differs.)
3. In the Page object's field list, **Subscribe** to the field **`leadgen`**.
4. Link the Page itself to the app — one-time API call. Easiest from
   **developers.facebook.com/tools/explorer**: pick the app, get a **Page**
   token for the page, then run
   `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen`.
   (Skipping this is the #1 reason webhooks silently never fire.)

## Part 5 — Test before spending money (~5 min)

1. Open **developers.facebook.com/tools/lead-ads-testing**.
2. Pick the Page + a form → **Create lead** → **Track status**.
3. Check **nexops.my/leads** — a lead named per the test payload should be
   there within ~10 s, source `facebook`, status `New`, Meta ids in notes.
4. Delete the test lead from the lead's page afterwards.

If nothing lands: Vercel → project → **Logs**, filter `meta-leads` — the
route logs exactly which step failed (signature, Graph fetch, insert).

## Part 6 — Crucial points when building the ads

- **Run the ads from THE Page** you subscribed in Part 4. A different/new
  Page = silent nothing until it's also added to the system user + subscribed.
- In the Instant Form, use Meta's **prefill questions** (Full name, Email,
  Phone number) — they map cleanly. Custom questions still arrive, but land
  in the lead's notes as extra Q&A lines (first custom answer also shows as
  "interested in").
- Phone prefill comes from the user's profile — adding Email **and** Phone
  gives sales two ways to reach them.
- **Leads Access Manager** (Business Suite → sometimes restricted): if lead
  access was ever customised for the Page, grant access to the system user /
  CRM there, or the Graph fetch 200s in Meta but is denied for us.
- Leads are fetchable via API for **90 days** after submit. The webhook grabs
  them in seconds, so this only matters for backfilling old leads (those you
  can still download once as CSV from Ads Manager and add by hand).
- Duplicate webhooks from Meta are handled (each lead carries its
  `Meta lead id` — repeats are skipped), so Meta retrying is harmless.

## Ops notes

- Endpoint answers `503` until all three env vars exist; `401` on bad
  signature; `500` on a genuine failure (Meta then retries automatically —
  a Supabase blip does not lose the lead).
- Organic form submits (someone finds the form without an ad) also arrive —
  marked `Organic (not from a paid ad)` in notes.
- If the client-Page case ever comes up (running lead ads from a **client's**
  Page instead of Nexova's own): same code, but Meta then requires **App
  Review / Advanced Access** for `leads_retrieval` + business verification.
  Plan ~1–2 weeks for that.
