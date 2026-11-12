/**
 * Planners data adapter. Dispatches via `isSupabaseEnabled("planners")`.
 *
 * Supabase keeps the structured parts of the planner (objectives, phases,
 * lines, payment schedule, addenda) as JSONB and the prose as text columns.
 */
import { createServiceClient } from "@/lib/supabase/server";
import type { PlannerRow, Database } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as dev from "@/lib/dev-store/planners";

export {
    APPROVERS,
    APPROVER_LABEL,
    DEFAULT_SPLIT,
    LINE_TYPES,
    LINE_TYPE_LABEL,
    LINE_TYPE_SHORT,
    PAYMENT_MODELS,
    PAYMENT_MODEL_LABEL,
    PLANNER_STATUSES,
    PLANNER_STATUS_LABEL,
    SEATS,
    SEAT_LABEL,
    SEAT_CATEGORIES,
    toLineType,
    toSeat,
    canHoldSeat,
    defaultApprover,
    CONTENT_LINE_TYPES,
    LINE_TYPE_WORDS,
    SEAT_SHORT,
    buildPlanner,
    defaultPhases,
    emptyPayment,
    isApprover,
    isLineType,
    isPaymentModel,
    isSeat,
    newLine,
    normalizeLine,
    normalizePlanner,
    sortPlanners,
} from "@/lib/dev-store/planners";
export type {
    Addendum,
    Approver,
    CreatePlannerInput,
    LineType,
    NewLineInput,
    PaymentModel,
    Planner,
    PlannerLine,
    PlannerObjective,
    PlannerPatch,
    PlannerPayment,
    PlannerPhase,
    PlannerStatus,
    ScheduleRow,
    Seat,
    SplitShare,
} from "@/lib/dev-store/planners";

type Planner = dev.Planner;
type Insert = Database["public"]["Tables"]["planners"]["Insert"];
type Update = Database["public"]["Tables"]["planners"]["Update"];

const TABLE = "planners" as const;

function rowToPlanner(row: PlannerRow): Planner {
    return dev.normalizePlanner({
        id: row.id,
        leadId: row.lead_id,
        clientName: row.client_name,
        preparedBy: row.prepared_by,
        title: row.title,
        version: row.version,
        status: row.status as Planner["status"],
        understanding: row.understanding,
        objectives: row.objectives as Planner["objectives"],
        pillars: row.pillars,
        channels: row.channels,
        phases: row.phases as Planner["phases"],
        lines: row.lines as Planner["lines"],
        quotationId: row.quotation_id,
        payment: row.payment as Planner["payment"],
        thirdPartyCosts: row.third_party_costs,
        assumptions: row.assumptions,
        clientResponsibilities: row.client_responsibilities,
        exclusions: row.exclusions,
        terms: row.terms,
        reviewDays: row.review_days,
        changeRounds: row.change_rounds,
        validUntil: row.valid_until ?? "",
        presentedAt: row.presented_at,
        acceptedAt: row.accepted_at,
        acceptedBy: row.accepted_by,
        contractId: row.contract_id,
        addenda: row.addenda as Planner["addenda"],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    });
}

function toInsert(p: Planner): Insert {
    return {
        id: p.id,
        lead_id: p.leadId,
        client_name: p.clientName,
        prepared_by: p.preparedBy,
        title: p.title,
        version: p.version,
        status: p.status,
        understanding: p.understanding,
        objectives: p.objectives,
        pillars: p.pillars,
        channels: p.channels,
        phases: p.phases,
        lines: p.lines,
        quotation_id: p.quotationId,
        payment: p.payment,
        third_party_costs: p.thirdPartyCosts,
        assumptions: p.assumptions,
        client_responsibilities: p.clientResponsibilities,
        exclusions: p.exclusions,
        terms: p.terms,
        review_days: p.reviewDays,
        change_rounds: p.changeRounds,
        valid_until: p.validUntil || null,
        presented_at: p.presentedAt,
        accepted_at: p.acceptedAt,
        accepted_by: p.acceptedBy,
        contract_id: p.contractId,
        addenda: p.addenda,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
    };
}

function patchToUpdate(patch: dev.PlannerPatch): Update {
    const out: Update = {};
    if (patch.leadId !== undefined) out.lead_id = patch.leadId;
    if (patch.clientName !== undefined) out.client_name = patch.clientName;
    if (patch.preparedBy !== undefined) out.prepared_by = patch.preparedBy;
    if (patch.title !== undefined) out.title = patch.title;
    if (patch.version !== undefined) out.version = patch.version;
    if (patch.status !== undefined) out.status = patch.status;
    if (patch.understanding !== undefined) out.understanding = patch.understanding;
    if (patch.objectives !== undefined) out.objectives = patch.objectives;
    if (patch.pillars !== undefined) out.pillars = patch.pillars;
    if (patch.channels !== undefined) out.channels = patch.channels;
    if (patch.phases !== undefined) out.phases = patch.phases;
    if (patch.lines !== undefined) out.lines = patch.lines;
    if (patch.quotationId !== undefined) out.quotation_id = patch.quotationId;
    if (patch.payment !== undefined) out.payment = patch.payment;
    if (patch.thirdPartyCosts !== undefined) out.third_party_costs = patch.thirdPartyCosts;
    if (patch.assumptions !== undefined) out.assumptions = patch.assumptions;
    if (patch.clientResponsibilities !== undefined) out.client_responsibilities = patch.clientResponsibilities;
    if (patch.exclusions !== undefined) out.exclusions = patch.exclusions;
    if (patch.terms !== undefined) out.terms = patch.terms;
    if (patch.reviewDays !== undefined) out.review_days = patch.reviewDays;
    if (patch.changeRounds !== undefined) out.change_rounds = patch.changeRounds;
    if (patch.validUntil !== undefined) out.valid_until = patch.validUntil || null;
    if (patch.presentedAt !== undefined) out.presented_at = patch.presentedAt;
    if (patch.acceptedAt !== undefined) out.accepted_at = patch.acceptedAt;
    if (patch.acceptedBy !== undefined) out.accepted_by = patch.acceptedBy;
    if (patch.contractId !== undefined) out.contract_id = patch.contractId;
    if (patch.addenda !== undefined) out.addenda = patch.addenda;
    out.updated_at = patch.updatedAt ?? new Date().toISOString();
    return out;
}

export async function createPlanner(input: dev.CreatePlannerInput): Promise<Planner> {
    if (!isSupabaseEnabled("planners")) return dev.createPlanner(input);
    const p = dev.buildPlanner(input);
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).insert(toInsert(p)).select("*").single();
    if (error) throw new Error(`createPlanner: ${error.message}`);
    return rowToPlanner(data as PlannerRow);
}

export async function listPlanners(): Promise<Planner[]> {
    if (!isSupabaseEnabled("planners")) return dev.listPlanners();
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).select("*");
    if (error) throw new Error(`listPlanners: ${error.message}`);
    return dev.sortPlanners((data as PlannerRow[]).map(rowToPlanner));
}

export async function getPlannerById(id: string): Promise<Planner | null> {
    if (!isSupabaseEnabled("planners")) return dev.getPlannerById(id);
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`getPlannerById: ${error.message}`);
    return data ? rowToPlanner(data as PlannerRow) : null;
}

export async function updatePlanner(id: string, patch: dev.PlannerPatch): Promise<Planner> {
    if (!isSupabaseEnabled("planners")) return dev.updatePlanner(id, patch);
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).update(patchToUpdate(patch)).eq("id", id).select("*").single();
    if (error) throw new Error(`updatePlanner: ${error.message}`);
    return rowToPlanner(data as PlannerRow);
}

export async function deletePlanner(id: string): Promise<void> {
    if (!isSupabaseEnabled("planners")) return dev.deletePlanner(id);
    const sb = createServiceClient();
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deletePlanner: ${error.message}`);
}
