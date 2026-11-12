"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActingMember, getCurrentTeamMember, getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import {
    createContract,
    deleteContract,
    getContractById,
    updateContract,
    BILLING_CADENCES,
    CONTRACT_STAGES,
    CONTRACT_STATUSES,
    type BillingCadence,
    type ContractStage,
    type ContractStatus,
    type Crew,
    type Requirement,
    isSigned,
    requirementLabel,
    requirementsLabel,
} from "@/lib/data/contracts";
import { updateInvoice, listInvoices } from "@/lib/data/invoices";
import { createClient, listClients, updateClient } from "@/lib/data/clients";
import { listContentPosts, updateContentPost } from "@/lib/data/content";
import { listCampaigns, updateCampaign } from "@/lib/data/campaigns";
import { listWorks, updateWork, type Work } from "@/lib/data/works";
import { listTeamMembers } from "@/lib/data/team";
import { SEATS, type PlannerPhase } from "@/lib/data/planners";
import { phaseKeyFrom } from "@/lib/dev-store/planners";
import { normalizeRequirement } from "@/lib/contracts/requirements";
import { deliverablesFromForm, hasPhaseRows, phaseRowsFromForm } from "@/lib/contracts/rows";
import { DEFAULT_TEMPLATE_PHASES, MAX_PHASE_MONTHS, phasesForProject } from "@/lib/contracts/phases";
import { recordAudit } from "@/lib/data/audit";
import { notify } from "@/lib/data/notifications";
import { raiseMonthInvoice } from "@/lib/contracts/invoicing";
import { COST_KIND_LABEL, isCostKind, normalizeCosts, type ProjectCost } from "@/lib/contracts/costs";
import { contractMonths, generateContractTasks, isGenerated } from "@/lib/contracts/generate";
import { withHours } from "@/lib/capacity/helpers";
import { monthLabel, todayKey } from "@/lib/works/helpers";
import { fmtMyr } from "@/lib/format";

/** The "— new client —" option on the new-project form. */
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
    revalidatePath("/projects");
    if (id) revalidatePath(`/projects/${id}`);
    revalidatePath("/settings/clients");
    revalidatePath("/content");
    revalidatePath("/campaigns");
    revalidatePath("/invoices");
    revalidatePath("/pipeline");
    revalidatePath("/works");
    revalidatePath("/dashboard");
}

/** Pages that list tasks, after tasks were created or re-assigned. */
function revalidateTasks(id: string) {
    revalidate(id);
    revalidatePath(`/projects/${id}/document`);
    revalidatePath("/works");
    revalidatePath("/my-work");
    revalidatePath("/calendar");
    revalidatePath("/home");
    revalidatePath("/seo");
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---------------------------------------------------------------------------
// Deliverables and crew — read from a form
//
// The deliverable rows (`del_<i>_*`) are read with deliverablesFromForm; rows
// without a count are dropped, so "at least one deliverable" is simply a
// non-empty result. The crew (one person per seat) is set once, at creation;
// later changes are made per task.
// ---------------------------------------------------------------------------

/** One select per seat: `crew_<seat>`; "none" leaves the seat open. */
function crewFrom(formData: FormData): Crew {
    const crew: Crew = {};
    for (const seat of SEATS) {
        const name = pick(formData.get(`crew_${seat}`));
        if (name) crew[seat] = name;
    }
    return crew;
}

/** "Awareness post on Instagram · 4/wk · Website · once" for audit lines. */
function scopeSummary(reqs: Requirement[]): string {
    return requirementsLabel(reqs) || "no deliverables";
}

// ---------------------------------------------------------------------------
// Phases — helpers
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

// ---------------------------------------------------------------------------
// Project creation — with its tasks
// ---------------------------------------------------------------------------

/** Fields the new-project form sends back to itself when it is rejected. */
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
    "notes",
] as const;

/**
 * The row editors' fields (`<prefix>_<i>_<field>`), as posted, until the first
 * row without `first`. The `first` field is carried even when empty so the
 * rows stay contiguous for the reader on the other side.
 */
function copyRows(formData: FormData, params: Record<string, string>, prefix: string, first: string, fields: readonly string[]) {
    for (let i = 0; formData.get(`${prefix}_${i}_${first}`) !== null; i += 1) {
        for (const k of fields) {
            const v = clean(formData.get(`${prefix}_${i}_${k}`));
            if (v || k === first) params[`${prefix}_${i}_${k}`] = v;
        }
    }
}

/** `/projects/new?error=…` with everything typed so far, so nothing is lost. */
function newFormHref(formData: FormData, error: string): string {
    const params: Record<string, string> = { error };
    for (const k of NEW_FORM_FIELDS) {
        const v = clean(formData.get(k));
        if (v) params[k] = v;
    }
    copyRows(formData, params, "del", "type", ["type", "name", "count", "per", "channel"]);
    copyRows(formData, params, "phase", "name", ["key", "name", "summary", "from", "months"]);
    for (const seat of SEATS) {
        const v = pick(formData.get(`crew_${seat}`));
        if (v) params[`crew_${seat}`] = v;
    }
    return hrefWith("/projects/new", formData, params);
}

/**
 * The account manager creates the project in one go: client (existing or new),
 * terms, the deliverables, the phases (relative months, placed against the
 * start date) and the crew. When it is created signed, the tasks for every
 * month of the project (three ahead when open-ended) are generated at once,
 * with their post / campaign / article records; a draft gets them when it is
 * marked signed.
 */
export async function createContractWithTasksAction(formData: FormData) {
    const back = (error: string): never => redirect(newFormHref(formData, error));

    const name = clean(formData.get("name"));
    if (!name) back("name");

    const requirements = deliverablesFromForm(formData);
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
            const created = await createClient({ name: newClientName, status: "onboarding", dealOwner: accountManager });
            clientName = created.name;
            createdClient = true;
            await recordAudit({ entity: "client", entityId: created.id, kind: "create", summary: `Client ${created.name} created (onboarding) with project ${name}`, actor });
        }
    }
    if (!clientName) back("client");

    const today = new Date().toISOString().slice(0, 10);
    const startDate = ymd(formData.get("startDate")) || today;
    const endDate = ymd(formData.get("endDate"));
    if (endDate && endDate < startDate) back("dates");
    const signedAt = ymd(formData.get("signedAt"));

    // Phases: the rows on the form (month 1 = the start month), placed against the
    // start date and clipped to the term; a form without the editor gets the built-in list.
    const phaseRows = hasPhaseRows(formData) ? phaseRowsFromForm(formData) : DEFAULT_TEMPLATE_PHASES;
    const phases = phasesForProject(phaseRows, startDate, endDate);
    const months = contractMonths({ startDate, endDate });

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
        templateName: clean(formData.get("templateName")),
    });

    // The gate: tasks exist only once the contract is signed. A project written
    // with its signed date gets them now; a draft gets them when it is marked signed.
    const created = isSigned(c) ? await generateContractTasks(c, await listTeamMembers(), [], contractMonths(c)) : [];
    await recordAudit({
        entity: "contract",
        entityId: c.id,
        kind: "create",
        summary: `Project ${c.code} created for ${c.clientName}${createdClient ? " (new client)" : ""} · ${scopeSummary(requirements)}${
            isSigned(c) ? ` · signed ${signedAt} · ${plural(created.length, "task")} generated for ${plural(months.length, "month")}` : " · draft, tasks appear once signed"
        }`,
        actor,
    });
    revalidateTasks(c.id);
    redirect(hrefWith(`/projects/${c.id}`, formData));
}

/**
 * Add one deliverable row to the plan (the Plan tab is additive: existing rows
 * are changed or removed task by task on the Tasks tab). On a signed project
 * the row's tasks are generated right away for every month that already has
 * generated tasks, from the current month on — never into a past month. The
 * row is the last one, so `onlyIndex` is `requirements.length - 1`.
 */
export async function addDeliverableAction(formData: FormData) {
    const id = clean(formData.get("id"));
    if (!id) return;
    const c = await getContractById(id);
    if (!c) return;
    const row = normalizeRequirement({
        type: clean(formData.get("type")),
        name: clean(formData.get("name")),
        count: Number(clean(formData.get("count"))) || 0,
        per: clean(formData.get("per")),
        channel: clean(formData.get("channel")),
    });
    if (!row) redirect(hrefWith(`/projects/${id}`, formData, { tab: "plan", error: "deliverable" }) + "#requirements");
    const requirements = [...c.requirements, row];
    const updated = await updateContract(id, { requirements });

    let created: Work[] = [];
    let months: string[] = [];
    if (isSigned(updated)) {
        const [team, works] = await Promise.all([listTeamMembers(), listWorks()]);
        const existing = works.filter((w) => w.contractId === id);
        const thisMonth = todayKey().slice(0, 7);
        months = [...new Set(existing.filter(isGenerated).map((w) => w.month))].filter((m) => m >= thisMonth).sort();
        if (months.length > 0) {
            created = await generateContractTasks(updated, team, existing, months, { onlyIndex: requirements.length - 1 });
        }
    }
    const label = `${requirementLabel(row)}${row.channel ? ` on ${row.channel}` : ""}`;
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: `Deliverable added: ${label}${
            created.length
                ? ` · ${plural(created.length, "task")} generated for ${months.length === 1 ? monthLabel(months[0]) : `${monthLabel(months[0])} → ${monthLabel(months[months.length - 1])}`}`
                : isSigned(updated)
                  ? " · tasks follow with the next month added"
                  : " · tasks appear once signed"
        } · scope now ${scopeSummary(requirements)}`,
        actor: await actorName(formData),
    });
    if (created.length) revalidateTasks(id);
    else revalidate(id);
    redirect(hrefWith(`/projects/${id}`, formData, { tab: "plan" }) + "#requirements");
}

/**
 * Generate the tasks of one more month from the requirements. Any month of the
 * span that has none yet is accepted; on an open-ended project that includes
 * the month after the last generated one, which is how it keeps rolling.
 */
export async function addNextMonthAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const month = ym(formData.get("month"));
    if (!id || !month) return;
    const c = await getContractById(id);
    if (!c || !isSigned(c)) return;
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
        summary: `${plural(created.length, "task")} generated for ${monthLabel(month)} · ${scopeSummary(c.requirements)}`,
        actor: await actorName(formData),
    });
    revalidateTasks(id);
    redirect(hrefWith(`/projects/${id}`, formData, { wm: month }) + "#works");
}

// ---------------------------------------------------------------------------
// Project — details, status, terms, billing
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
        summary: "Project details updated",
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

/** Delete the project and detach everything that pointed at it. */
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
    redirect(hrefWith("/projects", formData));
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
 * The client record follows the project lifecycle: a new client sits in
 * onboarding from signing until the project is running, then goes active.
 */
async function syncClientStatus(clientName: string, stage: ContractStage) {
    const client = (await listClients()).find((c) => c.name === clientName);
    if (!client || client.internal) return;
    if (stage === "signed" && (client.status === "prospect" || client.status === "churned")) {
        await updateClient(client.id, { status: "onboarding" });
    } else if (stage === "delivering" && (client.status === "onboarding" || client.status === "prospect")) {
        await updateClient(client.id, { status: "active" });
    }
}

/**
 * Move the project along Draft → Signed → Running → Closed. Reaching "signed"
 * is the gate: it stamps the signed date when missing and generates the
 * tasks from the scope (the first time only); "running" makes the client
 * active. On an internal project "signed" is management approving the brief.
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
    let generated = 0;
    if (passesSigned) {
        const [team, works] = await Promise.all([listTeamMembers(), listWorks()]);
        const existingWorks = works.filter((w) => w.contractId === id);
        if (!existingWorks.some(isGenerated)) {
            generated = (await generateContractTasks(c, team, existingWorks, contractMonths(c))).length;
        }
    }
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "status",
        summary: `Stage: ${existing.stage} → ${stage}${passesSigned && !existing.signedAt ? ` · signed ${today}` : ""}${
            generated ? ` · ${plural(generated, "task")} generated · ${scopeSummary(c.requirements)}` : ""
        }`,
        actor,
        changes: [{ field: "stage", before: existing.stage, after: stage }],
    });
    await syncClientStatus(c.clientName, c.stage);
    if (generated) revalidateTasks(id);
    revalidate(id);
    revalidatePath("/works");
    revalidatePath("/calendar");
}

/** Link an existing invoice (a one-off, or one raised by hand) to this project. */
export async function linkInvoiceAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const invoiceId = pick(formData.get("invoiceId"));
    if (!id || !invoiceId) return;
    await updateInvoice(invoiceId, { contractId: id });
    revalidate(id);
}

// ---------------------------------------------------------------------------
// Costs — money spent on the project besides people's time (ad spend paid on
// the client's behalf, freelancers, software). The Money dashboard's margin
// subtracts them. Anyone who can open the project adds a row; only an admin
// deletes one.
// ---------------------------------------------------------------------------

function revalidateCosts(id: string) {
    revalidatePath(`/projects/${id}`);
    revalidatePath("/dashboard");
}

/** Add one cost row; `addedBy` is whoever is acting. Rows without a label or an amount are ignored. */
export async function addProjectCostAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const c = id ? await getContractById(id) : null;
    if (!c) return;
    const label = clean(formData.get("label")).slice(0, 120);
    const amountMyr = num(formData.get("amountMyr"));
    if (!label || !(amountMyr > 0)) return;
    const kindRaw = clean(formData.get("kind"));
    const actor = await actorName(formData);
    const row: ProjectCost = {
        id: crypto.randomUUID(),
        label,
        kind: isCostKind(kindRaw) ? kindRaw : "other",
        amountMyr,
        date: ymd(formData.get("date")) || todayKey(),
        addedBy: actor,
    };
    const costs = normalizeCosts([...c.costs, row]);
    const saved = costs.find((x) => x.id === row.id) ?? row;
    await updateContract(id, { costs });
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: `Cost added: ${saved.label} · ${COST_KIND_LABEL[saved.kind]} · ${fmtMyr(saved.amountMyr)} · ${saved.date}`,
        actor,
    });
    revalidateCosts(id);
}

/** Remove one cost row. Admins only: the button is hidden for everyone else, and this checks again. */
export async function deleteProjectCostAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const costId = clean(formData.get("costId"));
    const c = id && costId ? await getContractById(id) : null;
    if (!c) return;
    const member = await getActingMember(pick(formData.get("as")) || undefined);
    if (!isAdmin(member)) return;
    const row = c.costs.find((x) => x.id === costId);
    if (!row) return;
    await updateContract(id, { costs: c.costs.filter((x) => x.id !== costId) });
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: `Cost removed: ${row.label || COST_KIND_LABEL[row.kind]} · ${fmtMyr(row.amountMyr)} · ${row.date} (added by ${row.addedBy || "someone"})`,
        actor: await actorName(formData),
    });
    revalidateCosts(id);
}

// ---------------------------------------------------------------------------
// Work under the project
// ---------------------------------------------------------------------------

const WORK_KINDS = ["content", "campaign"] as const;
type WorkKind = (typeof WORK_KINDS)[number];

async function setWorkContract(kind: WorkKind, workId: string, contractId: string | null) {
    if (kind === "content") await updateContentPost(workId, { contractId });
    else await updateCampaign(workId, { contractId });
}

/** Put an existing content post / campaign under this project. */
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
// Phases (the project's own — set from the form at creation, edited freely)
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
    revalidatePath(`/projects/${id}/document`);
    revalidatePath("/works");
    revalidatePath("/calendar");
}

/**
 * Add a phase. The months come either as real `startMonth` / `endMonth`
 * (YYYY-MM) or, from the Plan tab, as a relative row — `fromMonth` (1 = the
 * project's first month) and `months` — placed against the start date and
 * clipped to the term with phasesForProject. A relative row that would start
 * after the project ends is refused (`?error=phase`).
 */
export async function addContractPhaseAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const name = clean(formData.get("name"));
    if (!id || !name) return;
    const c = await getContractById(id);
    if (!c) return;
    const phases = c.phases;
    const key = uniqueKey(phaseKeyFrom(name), new Set(phases.map((ph) => ph.key)));
    const summary = clean(formData.get("summary"));
    let startMonth = ym(formData.get("startMonth"));
    let endMonth = ym(formData.get("endMonth"));
    if (!startMonth && !endMonth && formData.has("fromMonth")) {
        const relative = (v: FormDataEntryValue | null) => Math.min(MAX_PHASE_MONTHS, Math.max(1, Math.round(num(v) || 1)));
        const row = { key, name, summary, fromMonth: relative(formData.get("fromMonth")), months: relative(formData.get("months")) };
        const placed = phasesForProject([row], c.startDate, c.endDate)[0];
        if (!placed) redirect(hrefWith(`/projects/${id}`, formData, { tab: "plan", error: "phase" }) + "#phases");
        startMonth = placed.startMonth;
        endMonth = placed.endMonth;
    }
    const phase: ContractPhase = { key, name, summary, startMonth, endMonth };
    await updateContract(id, { phases: [...phases, phase] });
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: `Phase "${name}" added${phase.startMonth || phase.endMonth ? ` · ${phase.startMonth || "?"} → ${phase.endMonth || "?"}` : ""}`,
        actor: await actorName(formData),
    });
    revalidatePhases(id);
    if (formData.has("fromMonth")) redirect(hrefWith(`/projects/${id}`, formData, { tab: "plan" }) + "#phases");
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

// ---------------------------------------------------------------------------
// Account-manager handover
//
// Anyone may create a project, but once it has an account manager only that
// person can pass the role on, and the transfer happens when the named
// colleague accepts. Until then the project shows "transfer pending".
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
        body: `${actor} asks ${target.name} to become account manager of ${c.code} (${c.clientName})${note ? ` — ${note}` : ""}. Accept or decline on the project.`,
        link: `/projects/${id}?tab=setup`,
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
        link: `/projects/${id}`,
    });
    revalidateHandover(id);
}

/** The asked colleague declines; the current AM keeps the project. */
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
        link: `/projects/${id}?tab=setup`,
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
