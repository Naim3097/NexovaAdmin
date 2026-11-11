/**
 * Contracts data adapter. Dispatches via `isSupabaseEnabled("contracts")`.
 *
 * Supabase keeps the contract terms as plain columns and `billing` as JSONB,
 * so the adapter is a thin row ↔ model mapping.
 */
import { createServiceClient } from "@/lib/supabase/server";
import type { ContractRow, Database } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as dev from "@/lib/dev-store/contracts";

export {
    BILLING_CADENCES,
    CONTRACT_STAGES,
    CONTRACT_STAGE_LABEL,
    CONTRACT_STATUSES,
    emptyBilling,
    normalizeContract,
    normalizeCrew,
    normalizeRequirements,
    REQUIREMENT_CADENCES,
    sortContracts,
} from "@/lib/dev-store/contracts";
export type {
    BillingCadence,
    Contract,
    ContractBilling,
    ContractPhase,
    Crew,
    Handover,
    Requirement,
    RequirementCadence,
    ContractPatch,
    ContractStage,
    ContractStatus,
    CreateContractInput,
} from "@/lib/dev-store/contracts";

type Contract = dev.Contract;
type Insert = Database["public"]["Tables"]["contracts"]["Insert"];
type Update = Database["public"]["Tables"]["contracts"]["Update"];

const TABLE = "contracts" as const;

function rowToContract(row: ContractRow): Contract {
    return dev.normalizeContract({
        id: row.id,
        code: row.code,
        name: row.name,
        clientName: row.client_name,
        accountManager: row.account_manager,
        status: row.status as Contract["status"],
        phases: row.phases as Contract["phases"],
        requirements: row.requirements as Contract["requirements"],
        crew: row.crew as Contract["crew"],
        handover: row.handover as Contract["handover"],
        stage: row.stage as Contract["stage"],
        startDate: row.start_date ?? "",
        endDate: row.end_date ?? "",
        reference: row.reference,
        quotationId: row.quotation_id,
        valueMyr: Number(row.value_myr),
        signedAt: row.signed_at,
        signedBy: row.signed_by,
        fileUrl: row.file_url,
        terms: row.terms,
        billing: row.billing as Contract["billing"],
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    });
}

function toInsert(c: Contract): Insert {
    return {
        id: c.id,
        code: c.code,
        name: c.name,
        client_name: c.clientName,
        account_manager: c.accountManager,
        status: c.status,
        phases: c.phases,
        requirements: c.requirements,
        crew: c.crew,
        handover: c.handover,
        stage: c.stage,
        start_date: c.startDate || null,
        end_date: c.endDate || null,
        reference: c.reference,
        quotation_id: c.quotationId,
        value_myr: c.valueMyr,
        signed_at: c.signedAt,
        signed_by: c.signedBy,
        file_url: c.fileUrl,
        terms: c.terms,
        billing: c.billing,
        notes: c.notes,
        created_at: c.createdAt,
        updated_at: c.updatedAt,
    };
}

function patchToUpdate(patch: dev.ContractPatch): Update {
    const out: Update = {};
    if (patch.name !== undefined) out.name = patch.name;
    if (patch.clientName !== undefined) out.client_name = patch.clientName;
    if (patch.accountManager !== undefined) out.account_manager = patch.accountManager;
    if (patch.status !== undefined) out.status = patch.status;
    if (patch.phases !== undefined) out.phases = patch.phases;
    if (patch.requirements !== undefined) out.requirements = patch.requirements;
    if (patch.crew !== undefined) out.crew = patch.crew;
    if (patch.handover !== undefined) out.handover = patch.handover;
    if (patch.stage !== undefined) out.stage = patch.stage;
    if (patch.startDate !== undefined) out.start_date = patch.startDate || null;
    if (patch.endDate !== undefined) out.end_date = patch.endDate || null;
    if (patch.reference !== undefined) out.reference = patch.reference;
    if (patch.quotationId !== undefined) out.quotation_id = patch.quotationId;
    if (patch.valueMyr !== undefined) out.value_myr = patch.valueMyr;
    if (patch.signedAt !== undefined) out.signed_at = patch.signedAt;
    if (patch.signedBy !== undefined) out.signed_by = patch.signedBy;
    if (patch.fileUrl !== undefined) out.file_url = patch.fileUrl;
    if (patch.terms !== undefined) out.terms = patch.terms;
    if (patch.billing !== undefined) out.billing = patch.billing;
    if (patch.notes !== undefined) out.notes = patch.notes;
    out.updated_at = patch.updatedAt ?? new Date().toISOString();
    return out;
}

async function nextCode(): Promise<string> {
    const sb = createServiceClient();
    const year = new Date().getFullYear();
    const prefix = `CON-${year}-`;
    const { data, error } = await sb.from(TABLE).select("code").like("code", `${prefix}%`);
    if (error) throw new Error(`nextContractCode: ${error.message}`);
    const used = (data ?? []).map((r) => Number.parseInt(r.code.slice(prefix.length), 10) || 0);
    const next = (used.length ? Math.max(...used) : 0) + 1;
    return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function createContract(input: dev.CreateContractInput): Promise<Contract> {
    if (!isSupabaseEnabled("contracts")) return dev.createContract(input);
    const c = dev.buildContract(input, await nextCode());
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).insert(toInsert(c)).select("*").single();
    if (error) throw new Error(`createContract: ${error.message}`);
    return rowToContract(data as ContractRow);
}

export async function listContracts(): Promise<Contract[]> {
    if (!isSupabaseEnabled("contracts")) return dev.listContracts();
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).select("*");
    if (error) throw new Error(`listContracts: ${error.message}`);
    return dev.sortContracts((data as ContractRow[]).map(rowToContract));
}

export async function getContractById(id: string): Promise<Contract | null> {
    if (!isSupabaseEnabled("contracts")) return dev.getContractById(id);
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`getContractById: ${error.message}`);
    return data ? rowToContract(data as ContractRow) : null;
}

export async function updateContract(id: string, patch: dev.ContractPatch): Promise<Contract> {
    if (!isSupabaseEnabled("contracts")) return dev.updateContract(id, patch);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .update(patchToUpdate(patch))
        .eq("id", id)
        .select("*")
        .single();
    if (error) throw new Error(`updateContract: ${error.message}`);
    return rowToContract(data as ContractRow);
}

export async function deleteContract(id: string): Promise<void> {
    if (!isSupabaseEnabled("contracts")) return dev.deleteContract(id);
    const sb = createServiceClient();
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deleteContract: ${error.message}`);
}
