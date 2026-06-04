/**
 * Seed Supabase from the local dev-store (.dev-data/*).
 *
 * One-time migration helper. Reads every dev-store entity via its list
 * function and bulk-inserts the rows into Supabase using the service role.
 *
 * Usage (from app/):
 *   USE_SUPABASE=0 npx tsx scripts/seed-from-dev-data.ts
 *   USE_SUPABASE=0 npx tsx scripts/seed-from-dev-data.ts --truncate   # delete existing rows first
 *
 * Notes:
 * - Force USE_SUPABASE=0 so the dev-store reads work; the service-role
 *   client below talks to Supabase directly, regardless of the flag.
 * - Onboarding upload BLOBS are NOT copied (only the `files` JSONB shape).
 *   For dev-uploads to migrate to Storage, run a separate one-shot manually.
 * - Idempotent on re-run only if `--truncate` is used; otherwise a duplicate
 *   PK error will surface.
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import type { Database } from "@/lib/supabase/types";

import { listAuditForEntity, listRecentAudit } from "@/lib/dev-store/audit";
import * as devAgency from "@/lib/dev-store/agency";
import * as devCampaigns from "@/lib/dev-store/campaigns";
import * as devClients from "@/lib/dev-store/clients";
import * as devContent from "@/lib/dev-store/content";
import * as devInvoices from "@/lib/dev-store/invoices";
import * as devLeads from "@/lib/dev-store/leads";
import * as devNotifications from "@/lib/dev-store/notifications";
import * as devOnboarding from "@/lib/dev-store/onboarding";
import * as devProjects from "@/lib/dev-store/projects";
import * as devSeo from "@/lib/dev-store/seo-articles";
import * as devServices from "@/lib/dev-store/services";
import * as devTeam from "@/lib/dev-store/team";

// Force dev-store reads.
process.env.USE_SUPABASE = "0";

// Load .env.local (tsx doesn't pick it up automatically).
loadEnv({ path: path.join(process.cwd(), ".env.local") });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
    console.error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
    process.exit(1);
}

const sb = createClient<Database>(URL, KEY, {
    auth: { persistSession: false },
});

const TRUNCATE = process.argv.includes("--truncate");

// Order matters for FKs (campaign_metrics references campaigns, etc.)
// All other refs are by name (client_name) or nullable so order is loose,
// but we still respect parent-before-child for the obvious cases.
const TRUNCATE_ORDER = [
    "audit_events",
    "notifications",
    "campaign_metrics",
    "campaigns",
    "invoice_items",
    "invoices",
    "content_posts",
    "seo_articles",
    "projects",
    "onboarding_submissions",
    "leads",
    "team_members",
    "clients",
    "services",
] as const;

async function truncateAll() {
    console.log("Truncating tables...");
    for (const table of TRUNCATE_ORDER) {
        const { error } = await sb
            .from(table)
            .delete()
            .neq("id", "__never_matches__");
        if (error) console.error(`  ${table}: ${error.message}`);
        else console.log(`  ${table}: cleared`);
    }
}

async function insertRows(table: string, rows: object[]): Promise<void> {
    if (rows.length === 0) {
        console.log(`  ${table}: 0`);
        return;
    }
    // Dynamic table name doesn't satisfy the typed Database union; cast away.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from(table as never) as any).insert(rows);
    if (error) {
        console.error(`  ${table}: FAILED — ${error.message}`);
        return;
    }
    console.log(`  ${table}: ${rows.length}`);
}

function camelToSnake(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
        const sk = k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
        out[sk] = v;
    }
    return out;
}

async function seedAgency() {
    const p = await devAgency.getAgencyProfile();
    const row = { id: "nexov", ...camelToSnake(p) };
    const { error } = await sb
        .from("agency_profile")
        .upsert(row, { onConflict: "id" });
    if (error) console.error(`  agency_profile: FAILED — ${error.message}`);
    else console.log(`  agency_profile: 1 (upsert)`);
}

async function seedServices() {
    const list = await devServices.listServices();
    await insertRows(
        "services",
        list.map((s) => camelToSnake(s)),
    );
}

async function seedClients() {
    const list = await devClients.listClients();
    await insertRows(
        "clients",
        list.map((c) => camelToSnake(c)),
    );
}

async function seedTeam() {
    const list = await devTeam.listTeamMembers();
    await insertRows(
        "team_members",
        list.map((m) => camelToSnake(m)),
    );
}

async function seedLeads() {
    const list = await devLeads.listLeads();
    await insertRows(
        "leads",
        list.map((l) => camelToSnake(l)),
    );
}

async function seedOnboarding() {
    const list = await devOnboarding.listSubmissions();
    await insertRows(
        "onboarding_submissions",
        list.map((s) => ({
            id: s.id,
            token: s.token,
            checklist_slug: s.checklistSlug,
            client_name: s.clientName,
            status: s.status,
            data: s.data,
            files: s.files,
            notes: s.notes,
            created_at: s.createdAt,
            updated_at: s.updatedAt,
            submitted_at: s.submittedAt,
        })),
    );
}

async function seedProjects() {
    const list = await devProjects.listProjects();
    await insertRows(
        "projects",
        list.map((p) => ({
            id: p.id,
            name: p.name,
            client_name: p.clientName,
            status: p.status,
            phase: p.phase,
            onboarding_submission_id: p.onboardingSubmissionId,
            notes: p.notes,
            tasks: p.tasks,
            deliverables: p.deliverables,
            signoff: p.signoff,
            portal_token: p.portalToken,
            created_at: p.createdAt,
            updated_at: p.updatedAt,
        })),
    );
}

async function seedInvoices() {
    const list = await devInvoices.listInvoices();
    await insertRows(
        "invoices",
        list.map((inv) => ({
            id: inv.id,
            number: inv.number,
            client_name: inv.clientName,
            project_id: inv.projectId,
            status: inv.status,
            issue_date: inv.issueDate,
            due_date: inv.dueDate,
            tax_rate_pct: inv.taxRatePct,
            notes: inv.notes,
            created_at: inv.createdAt,
            updated_at: inv.updatedAt,
            paid_at: inv.paidAt,
        })),
    );
    const items = list.flatMap((inv) =>
        inv.items.map((it, idx) => ({
            id: it.id,
            invoice_id: inv.id,
            description: it.description,
            quantity: it.quantity,
            unit_price_myr: it.unitPriceMyr,
            sort_order: idx,
        })),
    );
    await insertRows("invoice_items", items);
}

async function seedCampaigns() {
    const list = await devCampaigns.listCampaigns();
    await insertRows(
        "campaigns",
        list.map((c) => ({
            id: c.id,
            name: c.name,
            client_name: c.clientName,
            platform: c.platform,
            objective: c.objective,
            status: c.status,
            start_date: c.startDate || null,
            end_date: c.endDate || null,
            monthly_budget_myr: c.monthlyBudgetMyr,
            fee_model: c.feeModel,
            flat_fee_myr: c.flatFeeMyr,
            percent_fee: c.percentFee,
            external_id: c.externalId,
            landing_url: c.landingUrl,
            notes: c.notes,
            created_at: c.createdAt,
            updated_at: c.updatedAt,
        })),
    );
    const metrics = list.flatMap((c) =>
        c.metrics.map((m) => ({
            id: m.id,
            campaign_id: c.id,
            date: m.date,
            spend_myr: m.spendMyr,
            impressions: m.impressions,
            clicks: m.clicks,
            leads_reported: m.leadsReported,
            conversions_reported: m.conversionsReported,
            notes: m.notes,
            entered_by: m.enteredBy,
            created_at: m.createdAt,
        })),
    );
    await insertRows("campaign_metrics", metrics);
}

async function seedContent() {
    const list = await devContent.listContentPosts();
    await insertRows(
        "content_posts",
        list.map((p) => ({
            id: p.id,
            title: p.title,
            client_name: p.clientName,
            project_id: p.projectId,
            platform: p.platform,
            type: p.type,
            status: p.status,
            scheduled_for: p.scheduledFor,
            scheduled_time: p.scheduledTime,
            caption: p.caption,
            hashtags: p.hashtags,
            notes: p.notes,
            assignee: p.assignee,
            created_at: p.createdAt,
            updated_at: p.updatedAt,
            posted_at: p.postedAt,
        })),
    );
}

async function seedSeo() {
    const list = await devSeo.listSeoArticles();
    await insertRows(
        "seo_articles",
        list.map((a) => ({
            id: a.id,
            title: a.title,
            client_name: a.clientName,
            target_keyword: a.targetKeyword,
            secondary_keywords: a.secondaryKeywords,
            search_intent: a.searchIntent,
            target_word_count: a.targetWordCount,
            brief: a.brief,
            outline: a.outline,
            body: a.body,
            published_url: a.publishedUrl,
            stage: a.stage,
            assignee: a.assignee,
            target_date: a.targetDate || null,
            created_at: a.createdAt,
            updated_at: a.updatedAt,
            published_at: a.publishedAt,
        })),
    );
}

async function seedNotifications() {
    const list = await devNotifications.listNotifications();
    await insertRows(
        "notifications",
        list.map((n) => ({
            id: n.id,
            kind: n.kind,
            title: n.title,
            body: n.body,
            link: n.link,
            created_at: n.createdAt,
            read_at: n.readAt,
        })),
    );
}

async function seedAudit() {
    // listRecentAudit caps at limit; pass a huge number to grab all.
    const list = await listRecentAudit(100000);
    // listAuditForEntity exists for dev-store but listRecentAudit returns
    // everything in dev mode. Reference both imports to satisfy lint.
    void listAuditForEntity;
    await insertRows(
        "audit_events",
        list.map((e) => ({
            id: e.id,
            at: e.at,
            entity: e.entity,
            entity_id: e.entityId,
            kind: e.kind,
            summary: e.summary,
            actor: e.actor,
            changes: e.changes,
        })),
    );
}

async function main() {
    console.log(`Seeding Supabase (URL=${URL})`);
    if (TRUNCATE) await truncateAll();
    console.log("Inserting...");
    // Order: parents before children, but cross-entity refs are by
    // client_name string so most can run in parallel safely. Keep sequential
    // for predictable error messages.
    await seedAgency();
    await seedServices();
    await seedClients();
    await seedTeam();
    await seedLeads();
    await seedOnboarding();
    await seedProjects();
    await seedInvoices();
    await seedCampaigns();
    await seedContent();
    await seedSeo();
    await seedNotifications();
    await seedAudit();
    console.log("Done.");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
