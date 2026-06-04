/**
 * Leads data adapter.
 *
 * Re-exports the dev-store types/constants and dispatches CRUD calls to either
 * the dev-store JSON-file impl or the Supabase impl based on
 * `isSupabaseEnabled("leads")`.
 *
 * Supabase access uses the service-role client while DEV_AUTH_BYPASS is on
 * (no real session yet). After I1.15 magic-link auth lands, switch to
 * `createClient` so RLS applies.
 */
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database, LeadRow } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as devLeads from "@/lib/dev-store/leads";

// Re-export the public API surface (types + constants) so consumers only
// need to import from "@/lib/data/leads".
export { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/dev-store/leads";
export type { Lead, LeadSource, LeadStatus } from "@/lib/dev-store/leads";

// Local aliases for use within this file.
type Lead = devLeads.Lead;
type LeadSource = devLeads.LeadSource;
type LeadStatus = devLeads.LeadStatus;
type CreateLeadInput = Parameters<typeof devLeads.createLead>[0];
type UpdateLeadPatch = Partial<Omit<Lead, "id" | "createdAt">>;

type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

const TABLE = "leads" as const;

function rowToLead(row: LeadRow): Lead {
    return {
        id: row.id,
        name: row.name,
        company: row.company,
        email: row.email,
        phone: row.phone,
        source: row.source as LeadSource,
        sourceCampaignId: row.source_campaign_id,
        interestedIn: row.interested_in,
        estValueMyr: Number(row.est_value_myr),
        status: row.status as LeadStatus,
        notes: row.notes,
        onboardingSubmissionId: row.onboarding_submission_id,
        assignedTo: row.assigned_to,
        score: row.score,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function leadToInsert(lead: Lead): LeadInsert {
    return {
        id: lead.id,
        name: lead.name,
        company: lead.company,
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
        source_campaign_id: lead.sourceCampaignId,
        interested_in: lead.interestedIn,
        est_value_myr: lead.estValueMyr,
        status: lead.status,
        notes: lead.notes,
        onboarding_submission_id: lead.onboardingSubmissionId,
        assigned_to: lead.assignedTo,
        score: lead.score,
        created_at: lead.createdAt,
        updated_at: lead.updatedAt,
    };
}

function patchToUpdate(patch: UpdateLeadPatch): LeadUpdate {
    const out: LeadUpdate = {};
    if (patch.name !== undefined) out.name = patch.name;
    if (patch.company !== undefined) out.company = patch.company;
    if (patch.email !== undefined) out.email = patch.email;
    if (patch.phone !== undefined) out.phone = patch.phone;
    if (patch.source !== undefined) out.source = patch.source;
    if (patch.sourceCampaignId !== undefined) out.source_campaign_id = patch.sourceCampaignId;
    if (patch.interestedIn !== undefined) out.interested_in = patch.interestedIn;
    if (patch.estValueMyr !== undefined) out.est_value_myr = patch.estValueMyr;
    if (patch.status !== undefined) out.status = patch.status;
    if (patch.notes !== undefined) out.notes = patch.notes;
    if (patch.onboardingSubmissionId !== undefined)
        out.onboarding_submission_id = patch.onboardingSubmissionId;
    if (patch.assignedTo !== undefined) out.assigned_to = patch.assignedTo;
    if (patch.score !== undefined) out.score = patch.score;
    if (patch.updatedAt !== undefined) out.updated_at = patch.updatedAt;
    // updated_at is also auto-bumped by the trigger; setting it here is harmless.
    return out;
}

// ---------------------------------------------------------------------------
// Public API — same shape as src/lib/dev-store/leads.ts
// ---------------------------------------------------------------------------

export async function createLead(input: CreateLeadInput): Promise<Lead> {
    if (!isSupabaseEnabled("leads")) return devLeads.createLead(input);

    const now = new Date().toISOString();
    const lead: Lead = {
        id: randomUUID(),
        name: input.name,
        company: input.company ?? "",
        email: input.email ?? "",
        phone: input.phone ?? "",
        source: input.source ?? "other",
        sourceCampaignId: input.sourceCampaignId ?? null,
        interestedIn: input.interestedIn ?? "",
        estValueMyr: input.estValueMyr ?? 0,
        status: "new",
        notes: input.notes ?? "",
        onboardingSubmissionId: null,
        assignedTo: input.assignedTo ?? "",
        score: input.score ?? 0,
        createdAt: now,
        updatedAt: now,
    };

    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .insert(leadToInsert(lead))
        .select("*")
        .single();
    if (error) throw new Error(`createLead: ${error.message}`);
    return rowToLead(data as LeadRow);
}

export async function listLeads(): Promise<Lead[]> {
    if (!isSupabaseEnabled("leads")) return devLeads.listLeads();
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .order("created_at", { ascending: false });
    if (error) throw new Error(`listLeads: ${error.message}`);
    return (data as LeadRow[]).map(rowToLead);
}

export async function getLeadById(id: string): Promise<Lead | null> {
    if (!isSupabaseEnabled("leads")) return devLeads.getLeadById(id);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(`getLeadById: ${error.message}`);
    return data ? rowToLead(data as LeadRow) : null;
}

export async function updateLead(id: string, patch: UpdateLeadPatch): Promise<Lead> {
    if (!isSupabaseEnabled("leads")) return devLeads.updateLead(id, patch);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .update(patchToUpdate(patch))
        .eq("id", id)
        .select("*")
        .single();
    if (error) throw new Error(`updateLead: ${error.message}`);
    return rowToLead(data as LeadRow);
}

export async function deleteLead(id: string): Promise<void> {
    if (!isSupabaseEnabled("leads")) return devLeads.deleteLead(id);
    const sb = createServiceClient();
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deleteLead: ${error.message}`);
}
