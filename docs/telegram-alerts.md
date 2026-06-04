# Telegram Alerts — Reference

How the team gets pinged on important events. Every alert is fired through the
in-app `notify()` function, which:
1. Inserts an in-app notification row (Supabase `notifications` table).
2. Fans out to Telegram if the alert kind is on the allow-list (see below).

Telegram failures are best-effort — they never block the underlying action.

---

## Alert kinds (current)

| Kind | Emoji | When it fires | Triggered from |
|---|---|---|---|
| `lead_new` | 🟢 | A new lead is created. | `src/lib/leads/actions.ts` → `createLeadAction` |
| `lead_won` | 💰 | Lead status → won. | `src/lib/leads/actions.ts` → `setLeadStatusAction` |
| `lead_lost` | ⚪ | Lead status → lost. | `src/lib/leads/actions.ts` → `setLeadStatusAction` |
| `onboarding_submitted` | 📝 | Client submits the public onboarding form. | `src/lib/onboarding/actions.ts` → `submitOnboardingAction` |
| `invoice_issued` | 📤 | Invoice status → sent (draft → sent). | `src/lib/invoices/actions.ts` → `setInvoiceStatusAction` |
| `invoice_paid` | ✅ | Invoice status → paid (manual record OR LeanX webhook). | `src/lib/invoices/actions.ts` (manual) + `src/app/api/webhooks/leanx/route.ts` (auto) |
| `invoice_overdue` | ⚠️ | Invoice status → overdue. | `src/lib/invoices/actions.ts` → `setInvoiceStatusAction` |
| `project_signoff` | 🎉 | Project signed off. | (existing project actions if/when called) |

### Kinds defined but NOT pushed to Telegram (in-app only)

These exist in the notification schema but stay silent on Telegram (low-noise):

- `deliverable_approved`
- `system`

To enable: add the kind to `TELEGRAM_KINDS` in `src/lib/telegram/templates.ts` and pick an emoji in `EMOJI`.

---

## Message format

```
🟢 *New lead: Acme Corp*
RM 25,000 · Web design · From referral

Open in Nexov Admin
```

- Title is bolded.
- Body is plain.
- Inline button "Open in Nexov Admin" — links deep into the relevant page.

### Dev-vs-prod nuance

Telegram **rejects HTTP localhost URLs** in inline buttons (only HTTPS public
URLs allowed). In dev, the link is appended as plain text at the bottom of the
message instead of a button. When deployed to `https://nexovadmin.com`, the
proper inline button appears automatically. No code change needed.

---

## Adding a new alert kind

1. **Add the kind to the schema** — edit `src/lib/dev-store/notifications.ts`
   (`NOTIFICATION_KINDS` constant). The DB `notifications.kind` column is plain
   text so no migration needed.

2. **Pick an emoji + allow-list it** — edit `src/lib/telegram/templates.ts`:
   ```ts
   const EMOJI = { ..., my_new_kind: "🔥" };
   const TELEGRAM_KINDS = new Set([..., "my_new_kind"]);
   ```

3. **Call `notify()` wherever the event happens**:
   ```ts
   import { notify } from "@/lib/data/notifications";

   await notify({
     kind: "my_new_kind",
     title: "Short, scannable headline",
     body: "One-line detail (optional)",
     link: `/some/path/${id}`,   // optional deep link
   });
   ```

That's it. Both in-app and Telegram fanout happen automatically.

---

## Sending a freeform alert (not tied to a notification kind)

For ad-hoc / agent-driven pings that don't fit any notify kind, use the
registered agent tool `telegram.sendAlert`:

```ts
import { telegramSendAlert } from "@/lib/agent/tools";

await telegramSendAlert.invoke({
  title: "AI flagged anomaly",
  body: "5 invoices issued in last hour — unusual",
  link: "/dashboard",
});
```

The future AI agent calls this tool the same way.

---

## Config

`.env.local`:
```env
TELEGRAM_BOT_TOKEN=<bot_id>:<secret>
TELEGRAM_TEAM_CHAT_ID=-5119227475
```

If either is missing, the app silently skips Telegram (logs a warning in dev
server output). In-app notifications still work.

To swap chats (e.g. move from dev test group to a production team group),
just change `TELEGRAM_TEAM_CHAT_ID` and restart the server.

---

## Diagnostic endpoints

- `GET /api/telegram/test` — dev-only smoke test. Returns `{ok:true,messageId:N}` on success.

---

## Files involved

```
src/lib/telegram/
  ├── client.ts          # creds reader (lazy)
  ├── send.ts            # generic send wrapper (retry / button filtering)
  └── templates.ts       # notify-kind → message format mapping

src/lib/data/notifications.ts   # notify() — calls send.ts after insert
src/lib/agent/tools.ts          # registers telegram.sendAlert
src/app/api/telegram/test/route.ts  # smoke test endpoint
```
