# 02 — Data Model

All tables live in Supabase Postgres. Row-Level Security (RLS) enforces access by `role`.

## Core Entities

### `users`
Team members and clients. Supabase Auth handles login. Roles & skills live in separate tables (see below) so we can add new roles, specialisms, and team groupings without a schema migration.
| Field | Type | Notes |
|---|---|---|
| id | uuid (PK) | from auth.users |
| name | text | |
| email | text | unique |
| phone | text | |
| avatar_url | text | |
| created_at | timestamptz | |

### `roles` · `user_roles`  *(flexible — add roles from the UI, not a migration)*
| Field | Type | Notes |
|---|---|---|
| roles.id | uuid | |
| roles.key | text unique | `ceo`, `closer`, `project_manager`, `content`, `ads_specialist`, `contractor`… |
| roles.name | text | display label |
| roles.scope | text | `staff` \| `client` |
| roles.permissions | jsonb | e.g. `{ "leads.*": true, "financials.view": false }` |
| roles.is_system | bool | core roles can't be deleted |
| user_roles | (user_id, role_id) | a user can have multiple roles |

### `skills` · `user_skills`  *(for smart task routing)*
| Field | Type | Notes |
|---|---|---|
| skills.key | text unique | `web-dev`, `mobile-dev`, `ui-design`, `copywriting`, `ads-meta`, `seo-tech`… |
| skills.category | text | `engineering` \| `design` \| `content` \| `marketing` \| `ops` |
| user_skills.level | int 1–5 | proficiency |

Tasks declare a `required_skill_id` instead of an implicit "frontend job." Anyone with the skill can pick it up; auto-suggest by skill + workload.

### `teams` · `team_members`  *(optional grouping for scale)*
Group people into Web Team, Ads Team, Content Team, Design Team. Tasks/projects can target a team, not just a person. Useful past ~10 staff.

### `industries`
Seed values from portfolio verticals: Tech/IT/Fintech, Automotive, Food/FMCG, Tourism/Hospitality, Retail/Fashion, Social Impact. Linked from `clients.industry_id`.

### `services` (catalog — 9 offerings)
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | e.g. "Website Creation" |
| type | enum | `website`, `app`, `social_media`, `meta_ads`, `google_ads`, `seo`, `gmb`, `brand`, `business_ops` |
| base_price | numeric | MYR |
| default_duration_days | int | |
| onboarding_template_id | uuid | FK → onboarding_templates |

### `leads`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| source | text | `website`, `meta_ad`, `referral`, etc. |
| campaign_id | uuid | FK → ad_campaigns (nullable) |
| name, email, phone | text | |
| service_interest | uuid | FK → services |
| status | enum | `new`, `contacted`, `qualified`, `consult_booked`, `won`, `lost` |
| ai_score | int | 1–10 |
| assigned_to | uuid | FK → users (closer) |
| notes | text | |
| created_at, updated_at | timestamptz | |

### `clients`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| lead_id | uuid | FK → leads |
| company_name | text | |
| industry_id | uuid | FK → industries |
| country | text | default `MY` |
| currency | text | default `MYR` |
| primary_contact_user_id | uuid | FK → users (role=client) |
| status | enum | `onboarding`, `active`, `paused`, `churned` |
| created_at | timestamptz | |

### `deals`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| lead_id, client_id | uuid | |
| service_id | uuid | |
| value | numeric | |
| currency | text | default `MYR` |
| stage | enum | `proposal`, `contract_sent`, `signed`, `paid`, `lost` |
| contract_url | text | |
| lean_payment_link | text | primary (MY) |
| stripe_payment_link | text | fallback (intl) |
| paid_at | timestamptz | |

### `projects`
Created automatically when `deals.stage = paid`.
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| client_id, deal_id, service_id | uuid | |
| status | enum | `onboarding`, `in_progress`, `qa`, `amendments`, `launched`, `handover`, `complete` |
| current_phase_id | uuid | |
| start_date, due_date | date | |

### `project_phases`
Created from a service template.
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| project_id | uuid | |
| name | text | `onboarding`, `info_collection`, `design`, `dev`, `qa`, `amendments`, `launch`, `handover` |
| order | int | |
| status | enum | `not_started`, `in_progress`, `blocked`, `done` |
| owner_id | uuid | FK → users |
| due | date | |

### `tasks`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| project_id, phase_id | uuid | |
| title, description | text | |
| assignee_id | uuid | direct assignment (optional) |
| required_skill_id | uuid | FK → skills (smart routing) |
| team_id | uuid | FK → teams (optional) |
| status | enum | `todo`, `doing`, `review`, `done` |
| due | date | |
| ai_generated | bool | |

### `onboarding_templates`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| service_id | uuid | |
| name | text | |
| schema_json | jsonb | sections + fields (text, file, multi-select, etc.) |

### `onboarding_forms`
Instance of a template, generated per project.
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| project_id | uuid | |
| template_id | uuid | |
| schema_json | jsonb | customized by Claude per client industry |
| status | enum | `draft`, `sent`, `in_progress`, `submitted`, `processed` |
| sent_at, submitted_at | timestamptz | |
| completion_pct | int | |

### `onboarding_submissions`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| form_id | uuid | |
| field_key | text | |
| value_text | text | |
| value_json | jsonb | |
| file_url | text | Supabase Storage path |

### `ad_campaigns`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| client_id | uuid | nullable (in-house if null) |
| platform | enum | `meta`, `google`, `tiktok` |
| objective | text | |
| budget | numeric | |
| status | enum | `draft`, `pending_approval`, `running`, `paused`, `complete` |
| external_id | text | platform campaign ID |
| spend, impressions, leads_generated | numeric | synced hourly |
| revenue_attributed | numeric | from won deals |

### `content_pieces`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| campaign_id, project_id | uuid | nullable |
| type | enum | `ad_copy`, `ad_image_brief`, `seo_article`, `email`, `social_post` |
| status | enum | `ai_draft`, `human_review`, `approved`, `published` |
| ai_draft | text | |
| ai_provider | text | `claude` (default) \| `gemini` |
| ai_model | text | |
| final_version | text | |
| author_id | uuid | |
| approved_by | uuid | |

### `invoices`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| client_id, project_id | uuid | |
| amount | numeric | |
| currency | text | default `MYR` |
| status | enum | `draft`, `sent`, `paid`, `overdue`, `void` |
| payment_provider | text | `lean` (default) \| `stripe` |
| lean_invoice_id | text | |
| stripe_invoice_id | text | |
| payment_link | text | |
| due_date, paid_at | date | |

### `files`  *(unified storage — multi-provider)*
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| entity_type, entity_id | text, uuid | polymorphic owner |
| storage_provider | text | `supabase` (default) \| `gdrive` |
| path | text | bucket/key OR Drive file id |
| filename, mime_type, size_bytes | | |
| uploaded_by | uuid | FK → users |

### `activity_log`
| Field | Type | Notes |
|---|---|---|
| id | bigserial | |
| entity_type | text | `lead`, `deal`, `project`, etc. |
| entity_id | uuid | |
| actor_id | uuid | |
| action | text | `status_changed`, `note_added`, `file_uploaded`, etc. |
| payload | jsonb | |
| created_at | timestamptz | |

## Relationships (high level)

```
users (clients) ──┐
                  ▼
leads ──► clients ──► deals ──► projects ──► phases ──► tasks
                          │           │
                          │           └─► onboarding_forms ──► submissions
                          │
                          └─► invoices

clients ──► ad_campaigns ──► content_pieces
projects ──► content_pieces (e.g., SEO articles)
```
