/**
 * Campaigns data adapter.
 *
 * Same child-table strategy as invoices: `metrics` lives in `campaign_metrics`
 * with cascade delete. Reads join in memory; writes go through targeted
 * helpers (`addCampaignMetric` upserts by date, `deleteCampaignMetric` deletes
 * by id) — `updateCampaign` itself never touches metrics (its dev-store
 * signature already excludes them via Omit<…, "metrics">).
 *
 * `totalsFor` and `computeManagementFee` are pure helpers — re-export.
 */
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type {
    Database,
    CampaignRow,
    CampaignMetricRow,
} from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as devCampaigns from "@/lib/dev-store/campaigns";

export {
    CAMPAIGN_PLATFORMS,
    CAMPAIGN_OBJECTIVES,
    CAMPAIGN_STATUSES,
    CAMPAIGN_FEE_MODELS,
    totalsFor,
    computeManagementFee,
} from "@/lib/dev-store/campaigns";
export type {
    Campaign,
    CampaignFeeModel,
    CampaignMetric,
    CampaignObjective,
    CampaignPlatform,
    CampaignStatus,
    CampaignTotals,
} from "@/lib/dev-store/campaigns";

type Campaign = devCampaigns.Campaign;
type CampaignMetric = devCampaigns.CampaignMetric;
type CampaignPlatform = devCampaigns.CampaignPlatform;
type CampaignObjective = devCampaigns.CampaignObjective;
type CampaignStatus = devCampaigns.CampaignStatus;
type CampaignFeeModel = devCampaigns.CampaignFeeModel;
type UpdatePatch = Partial<Omit<Campaign, "id" | "createdAt" | "metrics">>;

type CampaignInsert = Database["public"]["Tables"]["campaigns"]["Insert"];
type CampaignUpdate = Database["public"]["Tables"]["campaigns"]["Update"];
type CampaignMetricInsert =
    Database["public"]["Tables"]["campaign_metrics"]["Insert"];

const TABLE = "campaigns" as const;
const METRICS_TABLE = "campaign_metrics" as const;

const STATUS_ORDER: Record<CampaignStatus, number> = {
    live: 0,
    planning: 1,
    paused: 2,
    ended: 3,
};

function rowToMetric(row: CampaignMetricRow): CampaignMetric {
    return {
        id: row.id,
        date: row.date,
        spendMyr: Number(row.spend_myr),
        impressions: Number(row.impressions),
        clicks: Number(row.clicks),
        leadsReported: Number(row.leads_reported),
        conversionsReported: Number(row.conversions_reported),
        notes: row.notes,
        enteredBy: row.entered_by as CampaignMetric["enteredBy"],
        createdAt: row.created_at,
    };
}

function rowToCampaign(
    row: CampaignRow,
    metrics: CampaignMetricRow[],
): Campaign {
    return {
        id: row.id,
        name: row.name,
        clientName: row.client_name,
        platform: row.platform as CampaignPlatform,
        objective: row.objective as CampaignObjective,
        status: row.status as CampaignStatus,
        startDate: row.start_date ?? "",
        endDate: row.end_date ?? "",
        monthlyBudgetMyr: Number(row.monthly_budget_myr),
        feeModel: row.fee_model as CampaignFeeModel,
        flatFeeMyr: Number(row.flat_fee_myr),
        percentFee: Number(row.percent_fee),
        externalId: row.external_id,
        landingUrl: row.landing_url,
        notes: row.notes,
        metrics: metrics
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(rowToMetric),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function campaignToInsert(c: Campaign): CampaignInsert {
    return {
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
    };
}

function patchToUpdate(patch: UpdatePatch): CampaignUpdate {
    const out: CampaignUpdate = {};
    if (patch.name !== undefined) out.name = patch.name;
    if (patch.clientName !== undefined) out.client_name = patch.clientName;
    if (patch.platform !== undefined) out.platform = patch.platform;
    if (patch.objective !== undefined) out.objective = patch.objective;
    if (patch.status !== undefined) out.status = patch.status;
    if (patch.startDate !== undefined) out.start_date = patch.startDate || null;
    if (patch.endDate !== undefined) out.end_date = patch.endDate || null;
    if (patch.monthlyBudgetMyr !== undefined)
        out.monthly_budget_myr = patch.monthlyBudgetMyr;
    if (patch.feeModel !== undefined) out.fee_model = patch.feeModel;
    if (patch.flatFeeMyr !== undefined) out.flat_fee_myr = patch.flatFeeMyr;
    if (patch.percentFee !== undefined) out.percent_fee = patch.percentFee;
    if (patch.externalId !== undefined) out.external_id = patch.externalId;
    if (patch.landingUrl !== undefined) out.landing_url = patch.landingUrl;
    if (patch.notes !== undefined) out.notes = patch.notes;
    if (patch.updatedAt !== undefined) out.updated_at = patch.updatedAt;
    return out;
}

// ---------------------------------------------------------------------------
// CRUD primitives
// ---------------------------------------------------------------------------

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
    if (!isSupabaseEnabled("campaigns")) return devCampaigns.createCampaign(input);

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
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .insert(campaignToInsert(c))
        .select("*")
        .single();
    if (error) throw new Error(`createCampaign: ${error.message}`);
    return rowToCampaign(data as CampaignRow, []);
}

export async function listCampaigns(): Promise<Campaign[]> {
    if (!isSupabaseEnabled("campaigns")) return devCampaigns.listCampaigns();
    const sb = createServiceClient();
    const [{ data: cs, error: ce }, { data: ms, error: me }] =
        await Promise.all([
            sb.from(TABLE).select("*"),
            sb.from(METRICS_TABLE).select("*"),
        ]);
    if (ce) throw new Error(`listCampaigns: ${ce.message}`);
    if (me) throw new Error(`listCampaigns(metrics): ${me.message}`);
    const byCampaign = new Map<string, CampaignMetricRow[]>();
    for (const m of (ms ?? []) as CampaignMetricRow[]) {
        const arr = byCampaign.get(m.campaign_id) ?? [];
        arr.push(m);
        byCampaign.set(m.campaign_id, arr);
    }
    const out = (cs as CampaignRow[]).map((row) =>
        rowToCampaign(row, byCampaign.get(row.id) ?? []),
    );
    return out.sort((a, b) => {
        if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status])
            return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        return b.startDate.localeCompare(a.startDate);
    });
}

export async function getCampaignById(id: string): Promise<Campaign | null> {
    if (!isSupabaseEnabled("campaigns")) return devCampaigns.getCampaignById(id);
    const sb = createServiceClient();
    const { data: row, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(`getCampaignById: ${error.message}`);
    if (!row) return null;
    const { data: ms, error: me } = await sb
        .from(METRICS_TABLE)
        .select("*")
        .eq("campaign_id", id);
    if (me) throw new Error(`getCampaignById(metrics): ${me.message}`);
    return rowToCampaign(row as CampaignRow, (ms ?? []) as CampaignMetricRow[]);
}

export async function updateCampaign(
    id: string,
    patch: UpdatePatch,
): Promise<Campaign> {
    if (!isSupabaseEnabled("campaigns")) return devCampaigns.updateCampaign(id, patch);
    const sb = createServiceClient();
    const { error } = await sb
        .from(TABLE)
        .update(patchToUpdate(patch))
        .eq("id", id);
    if (error) throw new Error(`updateCampaign: ${error.message}`);
    const next = await getCampaignById(id);
    if (!next) throw new Error(`updateCampaign: ${id} disappeared`);
    return next;
}

export async function deleteCampaign(id: string): Promise<void> {
    if (!isSupabaseEnabled("campaigns")) return devCampaigns.deleteCampaign(id);
    const sb = createServiceClient();
    // campaign_metrics has ON DELETE CASCADE.
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deleteCampaign: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Metric helpers
// ---------------------------------------------------------------------------

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
    if (!isSupabaseEnabled("campaigns")) {
        return devCampaigns.addCampaignMetric(id, input);
    }
    const sb = createServiceClient();
    // Verify campaign exists (matches dev-store error behavior).
    const existing = await getCampaignById(id);
    if (!existing) throw new Error(`Campaign ${id} not found`);

    // Upsert-by-date: delete the existing row for (campaign_id, date) then insert.
    const { error: delErr } = await sb
        .from(METRICS_TABLE)
        .delete()
        .eq("campaign_id", id)
        .eq("date", input.date);
    if (delErr) throw new Error(`addCampaignMetric(del): ${delErr.message}`);

    const insert: CampaignMetricInsert = {
        id: randomUUID(),
        campaign_id: id,
        date: input.date,
        spend_myr: Math.max(0, Number(input.spendMyr ?? 0)),
        impressions: Math.max(0, Math.floor(Number(input.impressions ?? 0))),
        clicks: Math.max(0, Math.floor(Number(input.clicks ?? 0))),
        leads_reported: Math.max(
            0,
            Math.floor(Number(input.leadsReported ?? 0)),
        ),
        conversions_reported: Math.max(
            0,
            Math.floor(Number(input.conversionsReported ?? 0)),
        ),
        notes: input.notes ?? "",
        entered_by: "manual",
    };
    const { error: insErr } = await sb.from(METRICS_TABLE).insert(insert);
    if (insErr) throw new Error(`addCampaignMetric(ins): ${insErr.message}`);

    // Touch updated_at on the parent campaign.
    const { error: upErr } = await sb
        .from(TABLE)
        .update({ updated_at: new Date().toISOString() })
        .eq("id", id);
    if (upErr) throw new Error(`addCampaignMetric(touch): ${upErr.message}`);

    const next = await getCampaignById(id);
    if (!next) throw new Error(`addCampaignMetric: ${id} disappeared`);
    return next;
}

export async function deleteCampaignMetric(
    id: string,
    metricId: string,
): Promise<Campaign> {
    if (!isSupabaseEnabled("campaigns")) {
        return devCampaigns.deleteCampaignMetric(id, metricId);
    }
    const sb = createServiceClient();
    const existing = await getCampaignById(id);
    if (!existing) throw new Error(`Campaign ${id} not found`);
    const { error } = await sb
        .from(METRICS_TABLE)
        .delete()
        .eq("id", metricId)
        .eq("campaign_id", id);
    if (error) throw new Error(`deleteCampaignMetric: ${error.message}`);
    const next = await getCampaignById(id);
    if (!next) throw new Error(`deleteCampaignMetric: ${id} disappeared`);
    return next;
}
