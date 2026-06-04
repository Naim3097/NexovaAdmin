/**
 * DEV-ONLY local file store for ad campaigns + daily metric snapshots.
 * Replaced by Supabase `campaigns` + `campaign_metrics` tables once provisioned.
 *
 * Metrics are entered manually until Meta/Google/TikTok APIs are unfrozen.
 * Schema is shaped so an n8n hourly job can later upsert into the same fields.
 *
 * Cost is stored in MYR. If a platform reports in USD, n8n will convert at
 * snapshot time.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.join(process.cwd(), ".dev-data");
const CAMPAIGNS_DIR = path.join(ROOT, "campaigns");

export const CAMPAIGN_PLATFORMS = [
    "meta",
    "google",
    "tiktok",
    "linkedin",
    "x",
    "youtube",
    "other",
] as const;
export type CampaignPlatform = (typeof CAMPAIGN_PLATFORMS)[number];

export const CAMPAIGN_OBJECTIVES = [
    "leads",
    "sales",
    "traffic",
    "awareness",
    "engagement",
    "app_installs",
] as const;
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

export const CAMPAIGN_STATUSES = [
    "planning",
    "live",
    "paused",
    "ended",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/**
 * How we charge the client for managing this campaign.
 * - none: in-house (Nexov) — no client billing
 * - flat: fixed monthly retainer regardless of spend
 * - percent: percentage of ad spend (% management fee)
 * - flat_plus_percent: both — common for mid-tier accounts
 */
export const CAMPAIGN_FEE_MODELS = [
    "none",
    "flat",
    "percent",
    "flat_plus_percent",
] as const;
export type CampaignFeeModel = (typeof CAMPAIGN_FEE_MODELS)[number];

/**
 * One row per (campaign, date). Fields mirror what Meta Insights API returns
 * at daily granularity, so n8n can upsert without a translation layer.
 *
 * `leadsReported` is what the platform reports (lead-form leads). Actual lead
 * attribution from the CRM is computed separately by counting `Lead` records
 * with `sourceCampaignId === campaign.id`.
 */
export type CampaignMetric = {
    id: string;
    date: string; // YYYY-MM-DD
    spendMyr: number;
    impressions: number;
    clicks: number;
    leadsReported: number; // platform-reported (separate from CRM leads)
    conversionsReported: number;
    notes: string;
    enteredBy: "manual" | "meta_api" | "google_api" | "tiktok_api";
    createdAt: string;
};

export type Campaign = {
    id: string;
    name: string;
    clientName: string; // "Nexov" for in-house campaigns
    platform: CampaignPlatform;
    objective: CampaignObjective;
    status: CampaignStatus;
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD or "" for open-ended
    monthlyBudgetMyr: number;
    /** How we bill the client for managing this campaign. "none" = in-house. */
    feeModel: CampaignFeeModel;
    /** Flat monthly management fee in MYR. Used by flat + flat_plus_percent. */
    flatFeeMyr: number;
    /** % of ad spend charged as management fee. 15 = 15%. */
    percentFee: number;
    externalId: string; // Meta campaign id / Google campaign id (for future API sync)
    landingUrl: string;
    notes: string;
    metrics: CampaignMetric[];
    createdAt: string;
    updatedAt: string;
};

async function ensureDir() {
    await fs.mkdir(CAMPAIGNS_DIR, { recursive: true });
}

function fileFor(id: string) {
    return path.join(CAMPAIGNS_DIR, `${id}.json`);
}

function backfill(c: Campaign): Campaign {
    if (!Array.isArray(c.metrics)) c.metrics = [];
    if (typeof c.feeModel !== "string") {
        c.feeModel = c.clientName === "Nexov" ? "none" : "none";
    }
    if (typeof c.flatFeeMyr !== "number") c.flatFeeMyr = 0;
    if (typeof c.percentFee !== "number") c.percentFee = 0;
    return c;
}

export async function createCampaign(input: {
    name: string;
    clientName: string;
    platform?: CampaignPlatform;
    objective?: CampaignObjective;
    startDate?: string;
    endDate?: string;
    monthlyBudgetMyr?: number;
    feeModel?: CampaignFeeModel;
    flatFeeMyr?: number;
    percentFee?: number;
    externalId?: string;
    landingUrl?: string;
    notes?: string;
}): Promise<Campaign> {
    await ensureDir();
    const now = new Date().toISOString();
    const c: Campaign = {
        id: randomUUID(),
        name: input.name,
        clientName: input.clientName,
        platform: input.platform ?? "meta",
        objective: input.objective ?? "leads",
        status: "planning",
        startDate: input.startDate ?? now.slice(0, 10),
        endDate: input.endDate ?? "",
        monthlyBudgetMyr: Math.max(0, Number(input.monthlyBudgetMyr ?? 0)),
        feeModel: input.feeModel ?? "none",
        flatFeeMyr: Math.max(0, Number(input.flatFeeMyr ?? 0)),
        percentFee: Math.max(0, Number(input.percentFee ?? 0)),
        externalId: input.externalId ?? "",
        landingUrl: input.landingUrl ?? "",
        notes: input.notes ?? "",
        metrics: [],
        createdAt: now,
        updatedAt: now,
    };
    await fs.writeFile(fileFor(c.id), JSON.stringify(c, null, 2), "utf8");
    return c;
}

export async function listCampaigns(): Promise<Campaign[]> {
    await ensureDir();
    const entries = await fs.readdir(CAMPAIGNS_DIR);
    const out: Campaign[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const raw = await fs.readFile(path.join(CAMPAIGNS_DIR, entry), "utf8");
        out.push(backfill(JSON.parse(raw) as Campaign));
    }
    return out.sort((a, b) => {
        // live first, then by start date desc
        const order = { live: 0, planning: 1, paused: 2, ended: 3 } as const;
        if (order[a.status] !== order[b.status])
            return order[a.status] - order[b.status];
        return b.startDate.localeCompare(a.startDate);
    });
}

export async function getCampaignById(id: string): Promise<Campaign | null> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        return backfill(JSON.parse(raw) as Campaign);
    } catch {
        return null;
    }
}

export async function updateCampaign(
    id: string,
    patch: Partial<Omit<Campaign, "id" | "createdAt" | "metrics">>,
): Promise<Campaign> {
    const existing = await getCampaignById(id);
    if (!existing) throw new Error(`Campaign ${id} not found`);
    const updated: Campaign = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(fileFor(id), JSON.stringify(updated, null, 2), "utf8");
    return updated;
}

export async function deleteCampaign(id: string): Promise<void> {
    try {
        await fs.unlink(fileFor(id));
    } catch {
        // ignore
    }
}

export async function addCampaignMetric(
    id: string,
    input: {
        date: string;
        spendMyr: number;
        impressions: number;
        clicks: number;
        leadsReported: number;
        conversionsReported: number;
        notes?: string;
    },
): Promise<Campaign> {
    const existing = await getCampaignById(id);
    if (!existing) throw new Error(`Campaign ${id} not found`);
    // If a row exists for this date, replace it (manual entry treated as upsert).
    const filtered = existing.metrics.filter((m) => m.date !== input.date);
    const metric: CampaignMetric = {
        id: randomUUID(),
        date: input.date,
        spendMyr: Math.max(0, Number(input.spendMyr ?? 0)),
        impressions: Math.max(0, Math.floor(Number(input.impressions ?? 0))),
        clicks: Math.max(0, Math.floor(Number(input.clicks ?? 0))),
        leadsReported: Math.max(0, Math.floor(Number(input.leadsReported ?? 0))),
        conversionsReported: Math.max(
            0,
            Math.floor(Number(input.conversionsReported ?? 0)),
        ),
        notes: input.notes ?? "",
        enteredBy: "manual",
        createdAt: new Date().toISOString(),
    };
    const metrics = [...filtered, metric].sort((a, b) =>
        a.date.localeCompare(b.date),
    );
    return writeMetrics(id, metrics);
}

async function writeMetrics(
    id: string,
    metrics: CampaignMetric[],
): Promise<Campaign> {
    const existing = await getCampaignById(id);
    if (!existing) throw new Error(`Campaign ${id} not found`);
    const updated: Campaign = {
        ...existing,
        metrics,
        updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(fileFor(id), JSON.stringify(updated, null, 2), "utf8");
    return updated;
}

export async function deleteCampaignMetric(
    id: string,
    metricId: string,
): Promise<Campaign> {
    const existing = await getCampaignById(id);
    if (!existing) throw new Error(`Campaign ${id} not found`);
    return writeMetrics(
        id,
        existing.metrics.filter((m) => m.id !== metricId),
    );
}

/**
 * Aggregate metrics across a date range (inclusive). Pass empty strings to
 * include the full history.
 */
export type CampaignTotals = {
    spendMyr: number;
    impressions: number;
    clicks: number;
    leadsReported: number;
    conversionsReported: number;
    days: number;
};

export function totalsFor(
    metrics: CampaignMetric[],
    fromDate = "",
    toDate = "",
): CampaignTotals {
    const filtered = metrics.filter((m) => {
        if (fromDate && m.date < fromDate) return false;
        if (toDate && m.date > toDate) return false;
        return true;
    });
    return {
        spendMyr: filtered.reduce((s, m) => s + m.spendMyr, 0),
        impressions: filtered.reduce((s, m) => s + m.impressions, 0),
        clicks: filtered.reduce((s, m) => s + m.clicks, 0),
        leadsReported: filtered.reduce((s, m) => s + m.leadsReported, 0),
        conversionsReported: filtered.reduce(
            (s, m) => s + m.conversionsReported,
            0,
        ),
        days: filtered.length,
    };
}

/**
 * Compute the management fee charged to the client for a given spend amount.
 * Returns 0 for in-house ("none") campaigns.
 *
 * For flat_plus_percent: both components are summed (flat retainer covers
 * baseline work, percent scales with spend).
 *
 * `flatProrate` should be 1 for a full month. Pass a fraction (e.g. 0.5 for
 * half a month) when reporting partial-month windows.
 */
export function computeManagementFee(
    campaign: Pick<Campaign, "feeModel" | "flatFeeMyr" | "percentFee">,
    spendMyr: number,
    flatProrate: number = 1,
): number {
    const safeSpend = Math.max(0, spendMyr);
    const safeProrate = Math.max(0, flatProrate);
    switch (campaign.feeModel) {
        case "none":
            return 0;
        case "flat":
            return campaign.flatFeeMyr * safeProrate;
        case "percent":
            return safeSpend * (campaign.percentFee / 100);
        case "flat_plus_percent":
            return (
                campaign.flatFeeMyr * safeProrate +
                safeSpend * (campaign.percentFee / 100)
            );
        default:
            return 0;
    }
}
