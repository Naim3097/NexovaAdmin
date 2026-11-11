"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentTeamMember, getCurrentUser } from "@/lib/auth";
import {
    createContract,
    deleteContract,
    getContractById,
    updateContract,
    BILLING_CADENCES,
    CONTRACT_STAGES,
    CONTRACT_STATUSES,
    type BillingCadence,
    type Contract,
    type ContractStage,
    type ContractStatus,
    type Crew,
    type Requirement,
} from "@/lib/data/contracts";
import { updateInvoice, listInvoices } from "@/lib/data/invoices";
import { createClient, listClients, updateClient } from "@/lib/data/clients";
import { listContentPosts, updateContentPost } from "@/lib/data/content";
import { listCampaigns, updateCampaign } from "@/lib/data/campaigns";
import { listWorks, updateWork, type Work, type WorkShare } from "@/lib/data/works";
import { listTeamMembers, type TeamMember } from "@/lib/data/team";
import { LINE_TYPES, SEATS, type PlannerPhase } from "@/lib/data/planners";
import { getDefaultPhaseTemplate, getPhaseTemplateById } from "@/lib/data/phase-templates";
import { phaseKeyFrom } from "@/lib/dev-store/planners";
import { recordAudit } from "@/lib/data/audit";
import { notify } from "@/lib/data/notifications";
import { raiseMonthInvoice } from "@/lib/contracts/invoicing";
import { contractMonths, generateContractTasks, isGenerated } from "@/lib/contracts/generate";
import { withHours } from "@/lib/capacity/helpers";
import { monthLabel } from "@/lib/works/helpers";

/** The "— new client —" option on the contract form. */
const NEW_CLIENT = "__new";

function clean(v: FormDataEntryValue | null): string {
    return String(v ?? "").trim();
}

function num(v: FormDataEntryValue | null): number {
    const n = Number.parseFloat(clean(v));
    return Number.isFinite(n) ? n : 0;
}

/** "none" (the empty Select option) → "". */
function pick(v: FormDataEntryValue | null): string {
    const s = clean(v);
    return s === "none" ? "" : s;
}

function cadenceOf(v: FormDataEntryValue | null): BillingCadence {
    const s = clean(v);
    return (BILLING_CADENCES as readonly string[]).includes(s) ? (s as BillingCadence) : "monthly";
}

function invoiceDayOf(v: FormDataEntryValue | null): number {
    return Math.min(28, Math.max(1, Math.round(num(v) || 1)));
}

/** YYYY-MM-DD or "". */
function ymd(v: FormDataEntryValue | null): string {
    const s = clean(v);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

/** The linked member, else the dev-bypass `as` field on the form, else the login. */
async function actorName(formData?: FormData): Promise<string> {
    const member = await getCurrentTeamMember();
    if (member?.name) return member.name;
    const as = formData ? pick(formData.get("as")) : "";
    if (as) return as;
    const user = await getCurrentUser();
    return user?.email ?? "Team";
}

/** `path` with the dev-bypass `as` pick and any extra params carried along. */
function hrefWith(path: string, formData: FormData, params: Record<string, string | undefined> = {}): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    const as = pick(formData.get("as"));
    if (as) q.set("as", as);
    const s = q.toString();
    return s ? `${path}?${s}` : path;
}

function revalidate(id?: string) {
    revalidatePath("/contracts");
    if (id) revalidatePath(`/contracts/${id}`);
    revalidatePath("/settings/clients");
    revalidatePath("/content");
    revalidatePath("/campaigns");
    revalidatePath("/invoices");
    revalidatePath("/pipeline");
    revalidatePath("/management");
    revalidatePath("/management/work");
    revalidatePath("/management/contracts");
    revalidatePath("/management/clients");
}

/** Pages that list tasks, after tasks were created or re-assigned. */
function revalidateTasks(id: string) {
    revalidate(id);
    revalidatePath(`/contracts/${id}/document`);
    revalidatePath("/works");
    revalidatePath("/my-work");
    revalidatePath("/calendar");
    revalidatePath("/home");
    revalidatePath("/seo");
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---------------------------------------------------------------------------
// Requirements and crew — read from a form
// ---------------------------------------------------------------------------

/**
 * One row per task type on the form: `req_<type>_count`, `req_<type>_cadence`
 * ("monthly" | "once") and `req_<type>_channel`. Rows with a count of 0 are
 * dropped, so "at least one requirement" is simply a non-empty result.
 */
function requirementsFrom(formData: FormData): Requirement[] {
    const out: Requirement[] = [];
    for (const type of LINE_TYPES) {
        const count = Math.max(0, Math.round(num(formData.get(`req_${type}_count`))));
        if (count <= 0) continue;
        out.push({
            type,
            count,
            cadence: clean(formData.get(`req_${type}_cadence`)) === "once" ? "once" : "monthly",
            channel: clean(formData.get(`req_${type}_channel`)),
        });
    }
    return out;
}

/** One select per seat: `crew_<seat>`; "none" leaves the seat open. */
function crewFrom(formData: FormData): Crew {
    const crew: Crew = {};
    for (const seat of SEATS) {
        const name = pick(formData.get(`crew_${seat}`));
        if (name) crew[seat] = name;
    }
    return crew;
}

/** "3 posts/mo · 1 campaign/mo · 1 website item (once)" for audit lines. */
function requirementsSummary(reqs: Requirement[]): string {
    const words: Record<Requirement["type"], [string, string]> = {
        post: ["post", "posts"],
        campaign: ["campaign", "campaigns"],
        seo: ["SEO article", "SEO articles"],
        website: ["website item", "website items"],
        branding: ["branding item", "branding items"],
        custom: ["custom task", "custom tasks"],
    };
    return reqs.map((r) => `${r.count} ${words[r.type][r.count === 1 ? 0 : 1]}${r.cadence === "monthly" ? "/mo" : " (once)"}`).join(" · ") || "no requirements";
}

function crewSummary(crew: Crew): string {
    const parts = SEATS.filter((s) => crew[s]).map((s) => `${s}: ${crew[s]}`);
    return parts.join(" · ") || "no crew";
}

/**
 * The crew applied to one task, seat by seat: every share keeps its seat and
 * percentage, the person comes from the crew (the AM seat from the account
 * manager), and the hours are refilled from the new person's profile when the
 * person changed. Shares on seats the crew leaves open keep their holder.
 */
function crewShares(w: Work, c: Pick<Contract, "crew" | "accountManager">, team: TeamMember[]): WorkShare[] {
    return withHours(
        w.split.map((s) => {
            const member = c.crew[s.seat] ?? (s.seat === "am" ? c.accountManager || s.member : s.member);
            return { seat: s.seat, pct: s.pct, member, hours: member === s.member ? s.hours : 0 };
        }),
        team,
        w.type,
    );
}

function sameShares(a: WorkShare[], b: WorkShare[]): boolean {
    return a.length === b.length && a.every((s, i) => s.seat === b[i].seat && s.member === b[i].member && s.pct === b[i].pct && s.hours === b[i].hours);
}

// ---------------------------------------------------------------------------
// Phases — from a template
// ---------------------------------------------------------------------------

type ContractPhase = PlannerPhase;

/** YYYY-MM or "". */
function ym(v: FormDataEntryValue | null): string {
    const s = clean(v);
    return /^\d{4}-\d{2}$/.test(s) ? s : "";
}

/** `base`, or `base-2`, `base-3` … until it is not in `taken`. Adds the result to `taken`. */
function uniqueKey(base: string, taken: Set<string>): string {
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
    taken.add(key);
    return key;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Copy a template's phases onto a contract. Months survive from `previous`
 * where a phase of the same name already existed.
 */
function phasesFromTemplate(template: ContractPhase[], previous: ContractPhase[] = []): ContractPhase[] {
    const taken = new Set<string>();
    return template
        .filter((ph) => ph.name)
        .map((ph) => {
            const prev = previous.find((p) => sameName(p.name, ph.name));
            return {
                key: uniqueKey(ph.key || phaseKeyFrom(ph.name), taken),
                name: ph.name,
                summary: ph.summary,
                startMonth: ph.startMonth || prev?.startMonth || "",
                endMonth: ph.endMonth || prev?.endMonth || "",
            };
        });
}

/**
 * Give undated phases contiguous slices of the contract months, in order, so
 * generated tasks land in a phase from day one. Phases that already carry a
 * month are left alone; the account manager re-dates them on the Plan tab.
 */
function spreadPhases(phases: ContractPhase[], months: string[]): ContractPhase[] {
    if (months.length === 0 || phases.length === 0 || phases.some((ph) => ph.startMonth || ph.endMonth)) return phases;
    const n = phases.length;
    const m = months.length;
    return phases.map((ph, i) => {
        const from = m >= n ? Math.floor((i * m) / n) : Math.min(i, m - 1);
        const to = m >= n ? Math.floor(((i + 1) * m) / n) - 1 : Math.min(i, m - 1);
        return { ...ph, startMonth: months[from], endMonth: months[Math.max(from, to)] };
    });
}

// ---------------------------------------------------------------------------
// Contract creation — with its tasks
// ---------------------------------------------------------------------------

/** Fields the new-contract form sends back to itself when it is rejected. */
const NEW_FORM_FIELDS = [
    "name",
    "clientName",
    "newClientName",
    "accountManager",
    "startDate",
    "endDate",
    "signedAt",
    "reference",
    "valueMyr",
    "cadence",
    "amountMyr",
    "invoiceDay",
    "templateId",
    "notes",
] as const;

/** `/contracts/new?error=…` with everything typed so far, so nothing is lost. */
function newFormHref(formData: FormData, error: string): string {
    const params: Record<string, string> = { error };
    for (const k of NEW_FORM_FIELDS) {
        const v = clean(formData.get(k));
        if (v) params[k] = v;
    }
    for (const type of LINE_TYPES) {
        // Only rows with a count carry their cadence / channel back.
        if (Math.round(num(formData.get(`req_${type}_count`))) <= 0) continue;
        for (const k of ["count", "cadence", "channel"] as const) {
            const v = clean(formData.get(`req_${type}_${k}`));
            if (v) params[`req_${type}_${k}`] = v;
        }
    }
    for (const seat of SEATS) {
        const v = pick(formData.get(`crew_${seat}`));
        if (v) params[`crew_${seat}`] = v;
    }
    return hrefWith("/contracts/new", formData, params);
}

/**
 * The account manager creates the contract in one go: client (existing or new),
 * terms, phases from a template, the requirements and the crew. The tasks for
 * every month of the contract (three ahead when open-ended) are generated at
 * once, with their post / campaign / article records.
 */
export async function createContractWithTasksAction(formData: FormData) {
    const back = (error: string): never => redirect(newFormHref(formData, error));

    const name = clean(formData.get("name"));
    if (!name) back("name");

    const requirements = requirementsFrom(formData);
    if (requirements.length === 0) back("requirements");

    // Client: an existing record, or a new one created in onboarding.
    const clients = await listClients();
    const pickClient = pick(formData.get("clientName"));
    const newClientName = clean(formData.get("newClientName"));
    const accountManager = pick(formData.get("accountManager"));
    const actor = await actorName(formData);
    let clientName = "";
    let createdClient = false;
    if (pickClient && pickClient !== NEW_CLIENT) {
        clientName = clients.find((c) => c.name === pickClient)?.name ?? "";
    } else if (newClientName) {
        const existing = clients.find((c) => sameName(c.name, newClientName));
        if (existing) clientName = existing.name;
        else {
            const created = await createClient({ name: newClientName, status: "onboarding", accountManager });
            clientName = created.name;
            createdClient = true;
            await recordAudit({ entity: "client", entityId: created.id, kind: "create", summary: `Client ${created.name} created (onboarding) with contract ${name}`, actor });
        }
    }
    if (!clientName) back("client");

    const today = new Date().toISOString().slice(0, 10);
    const startDate = ymd(formData.get("startDate")) || today;
    const endDate = ymd(formData.get("endDate"));
    if (endDate && endDate < startDate) back("dates");
    const signedAt = ymd(formData.get("signedAt"));

    // Phases: the chosen template (the default when none was chosen), spread over the months.
    const templateId = pick(formData.get("templateId"));
    const template = templateId ? await getPhaseTemplateById(templateId) : await getDefaultPhaseTemplate();
    const months = contractMonths({ startDate, endDate });
    const phases = spreadPhases(phasesFromTemplate(template?.phases ?? []), months);

    const crew = crewFrom(formData);
    const c = await createContract({
        name,
        clientName,
        accountManager,
        startDate,
        endDate,
        status: "active",
        stage: signedAt ? "signed" : "created",
        phases,
        requirements,
        crew,
        reference: clean(formData.get("reference")),
        valueMyr: num(formData.get("valueMyr")),
        signedAt: signedAt || null,
        billing: {
            cadence: cadenceOf(formData.get("cadence")),
            amountMyr: num(formData.get("amountMyr")),
            invoiceDay: invoiceDayOf(formData.get("invoiceDay")),
        },
        notes: clean(formData.get("notes")),
    });

    const team = await listTeamMembers();
    const created = await generateContractTasks(c, team, [], contractMonths(c));
    await recordAudit({
        entity: "contract",
        entityId: c.id,
        kind: "create",
        summary: `Contract ${c.code} created for ${c.clientName}${createdClient ? " (new client)" : ""}${signedAt ? ` · signed ${signedAt}` : " · not yet signed"} · ${requirementsSummary(requirements)} · ${plural(created.length, "task")} generated for ${plural(months.length, "month")}`,
        actor,
    });
    revalidateTasks(c.id);
    redirect(hrefWith(`/contracts/${c.id}`, formData));
}

/** Replace the requirements. Months already generated keep their tasks; later months follow the new list. */
export async function saveRequirementsAction(formData: FormData) {
    const id = clean(formData.get("id"));
    if (!id) return;
    const existing = await getContractById(id);
    if (!existing) return;
    const requirements = requirementsFrom(formData);
    if (requirements.length === 0) redirect(hrefWith(`/contracts/${id}`, formData, { tab: "plan", error: "requirements" }) + "#requirements");
    await updateContract(id, { requirements });
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: `Requirements: ${requirementsSummary(requirements)} (was ${requirementsSummary(existing.requirements)})`,
        actor: await actorName(formData),
    });
    revalidate(id);
    redirect(hrefWith(`/contracts/${id}`, formData, { tab: "plan" }) + "#requirements");
}

/**
 * Save the crew (one person per seat). With `applyOpen`, every task on the
 * contract not yet started is re-assigned to the crew, seat by seat.
 */
export async function saveCrewAction(formData: FormData) {
    const id = clean(formData.get("id"));
    if (!id) return;
    const existing = await getContractById(id);
    if (!existing) return;
    const crew = crewFrom(formData);
    const c = await updateContract(id, { crew });
    let touched = 0;
    if (clean(formData.get("applyOpen")) === "1") {
        const [team, works] = await Promise.all([listTeamMembers(), listWorks()]);
        const open = works.filter((w) => w.contractId === id && w.status === "not_started");
        for (const w of open) {
            const split = crewShares(w, c, team);
            if (sameShares(split, w.split)) continue;
            await updateWork(w.id, { split });
            touched += 1;
        }
    }
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: `Crew: ${crewSummary(crew)}${touched ? ` · ${plural(touched, "open task")} re-assigned` : ""}`,
        actor: await actorName(formData),
    });
    if (touched) revalidateTasks(id);
    else revalidate(id);
    redirect(hrefWith(`/contracts/${id}`, formData, { tab: "plan" }) + "#crew");
}

/**
 * Generate the tasks of one more month from the requirements. Any month of the
 * span that has none yet is accepted; on an open-ended contract that includes
 * the month after the last generated one, which is how it keeps rolling.
 */
export async function addNextMonthAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const month = ym(formData.get("month"));
    if (!id || !month) return;
    const c = await getContractById(id);
    if (!c) return;
    const [team, works] = await Promise.all([listTeamMembers(), listWorks()]);
    const existing = works.filter((w) => w.contractId === id);
    const first = (c.startDate || month).slice(0, 7);
    const last = c.endDate ? c.endDate.slice(0, 7) : "";
    if (month < first || (last && month > last)) return;
    if (existing.some((w) => isGenerated(w) && w.month === month)) return;
    const created = await generateContractTasks(c, team, existing, [month]);
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: `${plural(created.length, "task")} generated for ${monthLabel(month)} · ${requirementsSummary(c.requirements)}`,
        actor: await actorName(formData),
    });
    revalidateTasks(id);
    redirect(hrefWith(`/contracts/${id}`, formData, { wm: month }) + "#works");
}

// ---------------------------------------------------------------------------
// Contract — details, status, terms, billing
// ---------------------------------------------------------------------------

export async function updateContractAction(formData: FormData) {
    const id = clean(formData.get("id"));
    if (!id) return;
    const existing = await getContractById(id);
    if (!existing) return;
    const patch: Parameters<typeof updateContract>[1] = {};
    const name = clean(formData.get("name"));
    if (name) patch.name = name;
    if (formData.get("accountManager") !== null) patch.accountManager = pick(formData.get("accountManager"));
    if (formData.get("startDate") !== null) patch.startDate = clean(formData.get("startDate")) || existing.startDate;
    if (formData.get("endDate") !== null) patch.endDate = clean(formData.get("endDate"));
    if (formData.get("notes") !== null) patch.notes = clean(formData.get("notes"));
    await updateContract(id, patch);
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: "Contract details updated",
        actor: await actorName(formData),
    });
    revalidate(id);
}

export async function setContractStatusAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const status = clean(formData.get("status"));
    if (!id || !(CONTRACT_STATUSES as readonly string[]).includes(status)) return;
    const existing = await getContractById(id);
    if (!existing || existing.status === status) return;
    await updateContract(id, { status: status as ContractStatus });
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "status",
        summary: `Status: ${existing.status} → ${status}`,
        actor: await actorName(formData),
        changes: [{ field: "status", before: existing.status, after: status }],
    });
    revalidate(id);
}

/** Delete the contract and detach everything that pointed at it. */
export async function deleteContractAction(formData: FormData) {
    const id = clean(formData.get("id"));
    if (!id) return;
    const [content, campaigns, invoices] = await Promise.all([
        listContentPosts(),
        listCampaigns(),
        listInvoices(),
    ]);
    await Promise.all([
        ...content.filter((x) => x.contractId === id).map((x) => updateContentPost(x.id, { contractId: null })),
        ...campaigns.filter((x) => x.contractId === id).map((x) => updateCampaign(x.id, { contractId: null })),
        ...invoices.filter((i) => i.contractId === id).map((i) => updateInvoice(i.id, { contractId: null })),
    ]);
    await deleteContract(id);
    revalidate();
    redirect(hrefWith("/contracts", formData));
}

export async function saveTermsAction(formData: FormData) {
    const id = clean(formData.get("id"));
    if (!id) return;
    const existing = await getContractById(id);
    if (!existing) return;
    const signedAt = clean(formData.get("signedAt"));
    await updateContract(id, {
        reference: clean(formData.get("reference")),
        quotationId: pick(formData.get("quotationId")) || null,
        valueMyr: num(formData.get("valueMyr")),
        signedAt: signedAt || null,
        signedBy: clean(formData.get("signedBy")),
        fileUrl: clean(formData.get("fileUrl")),
        terms: clean(formData.get("terms")),
    });
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: signedAt ? `Terms recorded · signed ${signedAt}` : "Terms recorded · not yet signed",
        actor: await actorName(formData),
        changes:
            existing.signedAt !== (signedAt || null)
                ? [{ field: "signedAt", before: existing.signedAt ?? "", after: signedAt }]
                : undefined,
    });
    revalidate(id);
}

export async function saveBillingAction(formData: FormData) {
    const id = clean(formData.get("id"));
    if (!id) return;
    await updateContract(id, {
        billing: {
            cadence: cadenceOf(formData.get("cadence")),
            amountMyr: num(formData.get("amountMyr")),
            invoiceDay: invoiceDayOf(formData.get("invoiceDay")),
        },
    });
    revalidate(id);
}

/** Raise the invoice for one month (draft, retainer line prefilled). Shared with month generation. */
export async function createMonthInvoiceAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const month = clean(formData.get("month")); // YYYY-MM
    if (!id || !/^\d{4}-\d{2}$/.test(month)) return;
    const c = await getContractById(id);
    if (!c) return;
    const inv = await raiseMonthInvoice(c, month);
    if (!inv) return;
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: `Invoice ${inv.number} raised${c.billing.cadence === "monthly" ? ` for ${month}` : ""}`,
        actor: await actorName(formData),
    });
    revalidate(id);
}

/**
 * The client record follows the contract lifecycle: a new client sits in
 * onboarding until the contract reaches "official", then goes active.
 */
async function syncClientStatus(clientName: string, stage: ContractStage) {
    const client = (await listClients()).find((c) => c.name === clientName);
    if (!client) return;
    if (stage === "onboarding" && (client.status === "prospect" || client.status === "churned")) {
        await updateClient(client.id, { status: "onboarding" });
    } else if ((stage === "official" || stage === "delivering") && (client.status === "onboarding" || client.status === "prospect")) {
        await updateClient(client.id, { status: "active" });
    }
}

/**
 * Move the contract along its lifecycle. Reaching "signed" stamps the signed
 * date when missing; reaching "official" makes the client active. Existing
 * clients jump from signed straight to "official".
 */
export async function setStageAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const stage = clean(formData.get("stage"));
    if (!id || !(CONTRACT_STAGES as readonly string[]).includes(stage)) return;
    const existing = await getContractById(id);
    if (!existing || existing.stage === stage) return;
    const actor = await actorName(formData);
    const patch: Parameters<typeof updateContract>[1] = { stage: stage as ContractStage };
    const today = new Date().toISOString().slice(0, 10);
    const passesSigned =
        CONTRACT_STAGES.indexOf(stage as ContractStage) >= CONTRACT_STAGES.indexOf("signed") &&
        CONTRACT_STAGES.indexOf(existing.stage) < CONTRACT_STAGES.indexOf("signed");
    if (passesSigned && !existing.signedAt) patch.signedAt = today;
    if (stage === "completed") patch.status = "completed";
    else if (existing.status === "draft") patch.status = "active";
    const c = await updateContract(id, patch);
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "status",
        summary: `Stage: ${existing.stage} → ${stage}${passesSigned && !existing.signedAt ? ` · signed ${today}` : ""}`,
        actor,
        changes: [{ field: "stage", before: existing.stage, after: stage }],
    });
    await syncClientStatus(c.clientName, c.stage);
    revalidate(id);
    revalidatePath("/works");
    revalidatePath("/calendar");
}

/** Link an existing invoice (milestone / one-off) to this contract. */
export async function linkInvoiceAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const invoiceId = pick(formData.get("invoiceId"));
    if (!id || !invoiceId) return;
    await updateInvoice(invoiceId, { contractId: id });
    revalidate(id);
}

// ---------------------------------------------------------------------------
// Work under the contract
// ---------------------------------------------------------------------------

const WORK_KINDS = ["content", "campaign"] as const;
type WorkKind = (typeof WORK_KINDS)[number];

async function setWorkContract(kind: WorkKind, workId: string, contractId: string | null) {
    if (kind === "content") await updateContentPost(workId, { contractId });
    else await updateCampaign(workId, { contractId });
}

/** Put an existing content post / campaign under this contract. */
export async function linkWorkAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const kind = clean(formData.get("kind"));
    const workId = pick(formData.get("workId"));
    if (!id || !workId || !(WORK_KINDS as readonly string[]).includes(kind)) return;
    const c = await getContractById(id);
    if (!c) return;
    await setWorkContract(kind as WorkKind, workId, id);
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: `${kind} linked to ${c.code}`,
        actor: await actorName(formData),
    });
    revalidate(id);
}

export async function unlinkWorkAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const kind = clean(formData.get("kind"));
    const workId = clean(formData.get("workId"));
    if (!id || !workId || !(WORK_KINDS as readonly string[]).includes(kind)) return;
    await setWorkContract(kind as WorkKind, workId, null);
    revalidate(id);
}

// ---------------------------------------------------------------------------
// Phases (the contract's own — from a template at creation, edited freely)
// ---------------------------------------------------------------------------

/** Does this task sit in the phase: by key, or by name when it carries no key (hand-added tasks). */
function inPhase(w: Work, ph: Pick<ContractPhase, "key" | "name">): boolean {
    return w.phaseKey === ph.key || (!w.phaseKey && w.phaseName === ph.name);
}

async function contractWorks(contractId: string): Promise<Work[]> {
    return (await listWorks()).filter((w) => w.contractId === contractId);
}

function revalidatePhases(id: string) {
    revalidate(id);
    revalidatePath(`/contracts/${id}/document`);
    revalidatePath("/works");
    revalidatePath("/calendar");
}

export async function addContractPhaseAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const name = clean(formData.get("name"));
    if (!id || !name) return;
    const c = await getContractById(id);
    if (!c) return;
    const phases = c.phases;
    const phase: ContractPhase = {
        key: uniqueKey(phaseKeyFrom(name), new Set(phases.map((ph) => ph.key))),
        name,
        summary: clean(formData.get("summary")),
        startMonth: ym(formData.get("startMonth")),
        endMonth: ym(formData.get("endMonth")),
    };
    await updateContract(id, { phases: [...phases, phase] });
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: `Phase "${name}" added${phase.startMonth || phase.endMonth ? ` · ${phase.startMonth || "?"} → ${phase.endMonth || "?"}` : ""}`,
        actor: await actorName(formData),
    });
    revalidatePhases(id);
}

/** Save one phase. Renaming cascades to every task in the phase. */
export async function updateContractPhaseAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const key = clean(formData.get("key"));
    const name = clean(formData.get("name"));
    if (!id || !key || !name) return;
    const c = await getContractById(id);
    if (!c) return;
    const phases = c.phases;
    const existing = phases.find((ph) => ph.key === key);
    if (!existing) return;
    const next: ContractPhase = {
        ...existing,
        name,
        summary: formData.has("summary") ? clean(formData.get("summary")) : existing.summary,
        startMonth: formData.has("startMonth") ? ym(formData.get("startMonth")) : existing.startMonth,
        endMonth: formData.has("endMonth") ? ym(formData.get("endMonth")) : existing.endMonth,
    };
    await updateContract(id, { phases: phases.map((ph) => (ph.key === key ? next : ph)) });
    const renamed = existing.name !== name;
    let touched = 0;
    if (renamed) {
        const works = (await contractWorks(id)).filter((w) => inPhase(w, existing));
        await Promise.all(works.map((w) => updateWork(w.id, { phaseKey: key, phaseName: name })));
        touched = works.length;
    }
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: renamed ? `Phase "${existing.name}" renamed to "${name}" · ${plural(touched, "task")} updated` : `Phase "${name}" updated`,
        actor: await actorName(formData),
        changes: renamed ? [{ field: `phase.${key}.name`, before: existing.name, after: name }] : undefined,
    });
    revalidatePhases(id);
}

/** Drop a phase. Its tasks stay, with no phase. */
export async function removeContractPhaseAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const key = clean(formData.get("key"));
    if (!id || !key) return;
    const c = await getContractById(id);
    if (!c) return;
    const phases = c.phases;
    const existing = phases.find((ph) => ph.key === key);
    if (!existing) return;
    await updateContract(id, { phases: phases.filter((ph) => ph.key !== key) });
    const works = (await contractWorks(id)).filter((w) => inPhase(w, existing));
    await Promise.all(works.map((w) => updateWork(w.id, { phaseKey: "", phaseName: "" })));
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: `Phase "${existing.name}" removed${works.length ? ` · ${plural(works.length, "task")} left without a phase` : ""}`,
        actor: await actorName(formData),
    });
    revalidatePhases(id);
}

/** Reorder: `dir` is "up" or "down". Two submit buttons share one form, so each gets its own action (a `name` on a formAction button is dropped by React). */
export async function movePhaseUpAction(formData: FormData) {
    await movePhase(formData, "up");
}
export async function movePhaseDownAction(formData: FormData) {
    await movePhase(formData, "down");
}

async function movePhase(formData: FormData, dir: "up" | "down") {
    const id = clean(formData.get("id"));
    const key = clean(formData.get("key"));
    if (!id || !key) return;
    const c = await getContractById(id);
    if (!c) return;
    const phases = c.phases;
    const from = phases.findIndex((ph) => ph.key === key);
    const to = dir === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= phases.length) return;
    const next = [...phases];
    [next[from], next[to]] = [next[to], next[from]];
    await updateContract(id, { phases: next });
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: `Phase "${phases[from].name}" moved ${dir} · order: ${next.map((ph) => ph.name).join(" → ")}`,
        actor: await actorName(formData),
    });
    revalidatePhases(id);
}

/**
 * Replace the contract's phases with a template's. Tasks whose phase name
 * matches a template phase are re-keyed to it; the others are left as they
 * are. Months survive where a phase of the same name already existed.
 */
export async function applyPhaseTemplateAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const templateId = pick(formData.get("templateId"));
    if (!id || !templateId) return;
    const [c, template] = await Promise.all([getContractById(id), getPhaseTemplateById(templateId)]);
    if (!c || !template) return;
    const phases = phasesFromTemplate(template.phases, c.phases);
    await updateContract(id, { phases });
    const relink = (await contractWorks(id)).flatMap((w) => {
        if (!w.phaseName) return [];
        const target = phases.find((ph) => sameName(ph.name, w.phaseName));
        if (!target || (w.phaseKey === target.key && w.phaseName === target.name)) return [];
        return [updateWork(w.id, { phaseKey: target.key, phaseName: target.name })];
    });
    await Promise.all(relink);
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: `Phases replaced from template "${template.name}" · ${phases.map((ph) => ph.name).join(" → ") || "no phases"}${relink.length ? ` · ${plural(relink.length, "task")} re-linked` : ""}`,
        actor: await actorName(formData),
    });
    revalidatePhases(id);
}

// ---------------------------------------------------------------------------
// Account-manager handover
//
// Anyone may create a contract, but once it has an account manager only that
// person can pass the role on, and the transfer happens when the named
// colleague accepts. Until then the contract shows "handover pending".
// ---------------------------------------------------------------------------

function revalidateHandover(id: string) {
    revalidate(id);
    revalidatePath("/home");
    revalidatePath("/my-clients");
    revalidatePath("/notifications");
    revalidatePath("/works");
}

/** Current AM asks a colleague to take over. */
export async function requestHandoverAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const to = pick(formData.get("to"));
    const note = clean(formData.get("note"));
    const c = id ? await getContractById(id) : null;
    if (!c || !to) return;
    const actor = await actorName(formData);
    if (!c.accountManager || !sameName(actor, c.accountManager) || sameName(to, c.accountManager)) return;
    const team = await listTeamMembers();
    const target = team.find((m) => m.active && sameName(m.name, to));
    if (!target) return;
    const now = new Date().toISOString();
    await updateContract(id, { handover: { to: target.name, by: actor, at: now, note } });
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: `Handover requested: ${actor} asked ${target.name} to take over ${c.code}${note ? ` — ${note}` : ""}`,
        actor,
    });
    await notify({
        kind: "handover_requested",
        title: `Take over ${c.name}?`,
        body: `${actor} asks ${target.name} to become account manager of ${c.code} (${c.clientName})${note ? ` — ${note}` : ""}. Accept or decline on the contract.`,
        link: `/contracts/${id}?tab=setup`,
    });
    revalidateHandover(id);
}

/** The asked colleague accepts: the role, the tasks and the AM seat move to them. */
export async function acceptHandoverAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const c = id ? await getContractById(id) : null;
    if (!c?.handover) return;
    const actor = await actorName(formData);
    if (!sameName(actor, c.handover.to)) return;
    const from = c.accountManager;
    const to = c.handover.to;
    const team = await listTeamMembers();
    await updateContract(id, { accountManager: to, handover: null, crew: { ...c.crew, am: to } });
    const works = (await listWorks()).filter((w) => w.contractId === id);
    for (const w of works) {
        const open = w.status !== "completed";
        const split = open
            ? withHours(
                  w.split.map((s) => (s.seat === "am" && sameName(s.member, from) ? { ...s, member: to, hours: 0 } : s)),
                  team,
                  w.type,
              )
            : w.split;
        await updateWork(w.id, { accountManager: to, split });
    }
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: `Account manager changed: ${from || "nobody"} → ${to} (accepted by ${to})`,
        actor,
        changes: [{ field: "accountManager", before: from, after: to }],
    });
    await notify({
        kind: "handover_accepted",
        title: `${to} now manages ${c.name}`,
        body: `${to} accepted the handover of ${c.code} (${c.clientName}) from ${from || "nobody"}.`,
        link: `/contracts/${id}`,
    });
    revalidateHandover(id);
}

/** The asked colleague declines; the current AM keeps the contract. */
export async function declineHandoverAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const note = clean(formData.get("note"));
    const c = id ? await getContractById(id) : null;
    if (!c?.handover) return;
    const actor = await actorName(formData);
    if (!sameName(actor, c.handover.to)) return;
    await updateContract(id, { handover: null });
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: `Handover declined by ${actor}${note ? ` — ${note}` : ""}`,
        actor,
    });
    await notify({
        kind: "handover_declined",
        title: `${actor} declined ${c.name}`,
        body: `${actor} did not take over ${c.code} (${c.clientName}); ${c.accountManager || "nobody"} stays account manager${note ? ` — ${note}` : ""}.`,
        link: `/contracts/${id}?tab=setup`,
    });
    revalidateHandover(id);
}

/** The current AM withdraws a pending request. */
export async function cancelHandoverAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const c = id ? await getContractById(id) : null;
    if (!c?.handover) return;
    const actor = await actorName(formData);
    if (!sameName(actor, c.accountManager)) return;
    await updateContract(id, { handover: null });
    await recordAudit({ entity: "contract", entityId: id, kind: "update", summary: `Handover request to ${c.handover.to} withdrawn`, actor });
    revalidateHandover(id);
}
