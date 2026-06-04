# Workflow 03 — In-House Ads → Leads (P1)

## Trigger
Manual: CEO clicks "New in-house campaign" in admin dashboard.

## Steps

| # | Trigger | Action |
|---|---|---|
| 1 | Form submit | Capture: service to promote, budget, angle, audience hints |
| 2 | n8n + Claude | Drafts 3 ad copy variants + 3 image briefs + targeting suggestions |
| 3 | UIUX reviews | Approves/edits image brief → designs creative → uploads to `content_pieces` |
| 4 | CEO approves | n8n pushes to Meta Ads / Google Ads via API; saves `external_id` |
| 5 | Hourly cron | Pull spend, impressions, clicks, leads from platform APIs → `ad_campaigns` |
| 6 | Landing page lead | Webhook → create `lead` with `campaign_id` for attribution |
| 7 | Closer wins deal | `revenue_attributed` updates on the originating `ad_campaign` → ROAS auto-calculated |

## Outputs
- Real-time CEO dashboard tile: "Ad spend MTD vs revenue attributed"
- Per-campaign ROAS visible
- Creative library reusable across campaigns
