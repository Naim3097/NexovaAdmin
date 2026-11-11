/**
 * DEV-ONLY local file store for contracts.
 * Replaced by Supabase `contracts` table once provisioned.
 *
 * A CONTRACT is the signed job we have with a client. It sits UNDER the client
 * and the work sits UNDER it: tasks (works), content posts, campaigns and
 * invoices carry a `contractId`. The contract answers one question per client:
 * do we have a job or not, and on what terms (reference, value, signed date,
 * billing cadence, start/end) — and, through its phases, where the engagement
 * stands.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { devDataRoot } from "@/lib/dev-store/root";
import { randomUUID } from "node:crypto";
import { isLineType, isSeat, normalizePhases, type LineType, type PlannerPhase, type Seat } from "@/lib/dev-store/planners";

const ROOT = devDataRoot();
const DIR = path.join(ROOT, "contracts");

/** A contract phase: name, summary, months. Starts from a template, edited freely. */
export type ContractPhase = PlannerPhase;

/**
 * What the account manager said the contract needs, entered when the contract
 * is created: "3 content posts a month, 1 campaign a month, 1 website build".
 * Tasks are generated from these; the AM edits the tasks afterwards.
 */
export const REQUIREMENT_CADENCES = ["monthly", "once"] as const;
export type RequirementCadence = (typeof REQUIREMENT_CADENCES)[number];
export type Requirement = {
    type: LineType;
    /** Tasks per month (monthly) or in total (once). */
    count: number;
    cadence: RequirementCadence;
    /** Channel hint for generated tasks ("Instagram", "Meta", "Blog"); "" = default per type. */
    channel: string;
};

export function normalizeRequirements(raw: unknown): Requirement[] {
    if (!Array.isArray(raw)) return [];
    const out: Requirement[] = [];
    for (const r of raw as Array<Partial<Requirement>>) {
        if (!r || !r.type || !isLineType(r.type)) continue;
        const count = Math.max(0, Math.round(Number(r.count) || 0));
        if (count <= 0) continue;
        out.push({
            type: r.type,
            count,
            cadence: r.cadence === "once" ? "once" : "monthly",
            channel: String(r.channel ?? ""),
        });
    }
    return out;
}

/** Default person per seat for this contract; generated tasks are assigned from it. */
export type Crew = Partial<Record<Seat, string>>;

/**
 * A pending transfer of the account-manager role. Only the current AM can start
 * one; it takes effect only when the named person accepts.
 */
export type Handover = {
    /** Member asked to take over. */
    to: string;
    /** Current AM who asked. */
    by: string;
    at: string;
    note: string;
};

export function normalizeHandover(raw: unknown): Handover | null {
    if (!raw || typeof raw !== "object") return null;
    const h = raw as Partial<Handover>;
    const to = String(h.to ?? "").trim();
    if (!to) return null;
    return { to, by: String(h.by ?? ""), at: String(h.at ?? new Date().toISOString()), note: String(h.note ?? "") };
}

export function normalizeCrew(raw: unknown): Crew {
    const out: Crew = {};
    if (!raw || typeof raw !== "object") return out;
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (isSeat(k) && typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
}

export const CONTRACT_STATUSES = ["draft", "active", "completed", "cancelled"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const BILLING_CADENCES = ["monthly", "milestone", "one_off"] as const;
export type BillingCadence = (typeof BILLING_CADENCES)[number];

/**
 * Lifecycle after the deal is closed in the pipeline:
 * created → signed → onboarding → official → delivering → completed.
 * Existing clients skip onboarding (signed → official).
 */
export const CONTRACT_STAGES = ["created", "signed", "onboarding", "official", "delivering", "completed"] as const;
export type ContractStage = (typeof CONTRACT_STAGES)[number];
export const CONTRACT_STAGE_LABEL: Record<ContractStage, string> = {
    created: "Draft",
    signed: "Signed",
    onboarding: "Onboarding",
    official: "Active",
    delivering: "Running",
    completed: "Closed",
};

export type ContractBilling = {
    cadence: BillingCadence;
    /** Per month (monthly) or per milestone / one-off (MYR). */
    amountMyr: number;
    /** Day of month the monthly invoice goes out (1–28). */
    invoiceDay: number;
};

export type Contract = {
    id: string;
    /** Human-readable, e.g. "CON-2026-0001". Generated at creation. */
    code: string;
    name: string;
    /** Must match a Clients record — every contract belongs to a client. */
    clientName: string;
    /** Team member name who owns the relationship for this contract. */
    accountManager: string;
    status: ContractStatus;
    /**
     * Phases of the engagement, from a template at creation and editable
     * afterwards. Tasks reference a phase by key; renaming a phase renames it
     * on its tasks.
     */
    phases: ContractPhase[];
    /** What the contract needs per month / in total; tasks are generated from this. */
    requirements: Requirement[];
    /** Default person per seat; new tasks are assigned from it unless the AM changes them. */
    crew: Crew;
    /** Pending account-manager transfer, null when none. */
    handover: Handover | null;
    /** Where the contract is in its lifecycle. */
    stage: ContractStage;
    startDate: string; // YYYY-MM-DD
    /** YYYY-MM-DD, "" = open-ended (rolling retainer). */
    endDate: string;
    /** Contract number / title, e.g. "MSA 2026-04" or the quote number. */
    reference: string;
    /** Accepted quotation this contract came from, if any. */
    quotationId: string | null;
    /** Total contract value (MYR). 0 = not set. */
    valueMyr: number;
    /** YYYY-MM-DD the client signed. null = NOT SIGNED (setup gap). */
    signedAt: string | null;
    signedBy: string;
    /** Link to the signed document (Drive, DocuSign, …). */
    fileUrl: string;
    /** Scope / terms summary — what the client is paying for. */
    terms: string;
    billing: ContractBilling;
    notes: string;
    createdAt: string;
    updatedAt: string;
};

export function emptyBilling(): ContractBilling {
    return { cadence: "monthly", amountMyr: 0, invoiceDay: 1 };
}

/** Fill in defaults for records written by an older shape. */
export function normalizeContract(raw: Partial<Contract> & { id: string }): Contract {
    const now = new Date().toISOString();
    return {
        id: raw.id,
        code: raw.code ?? "",
        name: raw.name ?? "",
        clientName: raw.clientName ?? "",
        accountManager: raw.accountManager ?? "",
        status: raw.status ?? "draft",
        phases: normalizePhases(raw.phases),
        requirements: normalizeRequirements(raw.requirements),
        crew: normalizeCrew(raw.crew),
        handover: normalizeHandover(raw.handover),
        stage: raw.stage ?? (raw.signedAt ? "signed" : "created"),
        startDate: raw.startDate ?? "",
        endDate: raw.endDate ?? "",
        reference: raw.reference ?? "",
        quotationId: raw.quotationId ?? null,
        valueMyr: raw.valueMyr ?? 0,
        signedAt: raw.signedAt ?? null,
        signedBy: raw.signedBy ?? "",
        fileUrl: raw.fileUrl ?? "",
        terms: raw.terms ?? "",
        billing: { ...emptyBilling(), ...(raw.billing ?? {}) },
        notes: raw.notes ?? "",
        createdAt: raw.createdAt ?? now,
        updatedAt: raw.updatedAt ?? now,
    };
}

async function ensureDir() {
    await fs.mkdir(DIR, { recursive: true });
}

function fileFor(id: string) {
    return path.join(DIR, `${id}.json`);
}

async function writeContract(c: Contract): Promise<Contract> {
    await ensureDir();
    await fs.writeFile(fileFor(c.id), JSON.stringify(c, null, 2), "utf8");
    return c;
}

export function sortContracts(list: Contract[]): Contract[] {
    const rank: Record<ContractStatus, number> = { active: 0, draft: 1, completed: 2, cancelled: 3 };
    return list.sort(
        (a, b) =>
            rank[a.status] - rank[b.status] ||
            (b.startDate || "").localeCompare(a.startDate || "") ||
            a.name.localeCompare(b.name),
    );
}

async function nextContractCode(): Promise<string> {
    const all = await listContracts();
    const year = new Date().getFullYear();
    const prefix = `CON-${year}-`;
    const used = all
        .map((c) => c.code)
        .filter((n) => n.startsWith(prefix))
        .map((n) => Number.parseInt(n.slice(prefix.length), 10) || 0);
    const next = (used.length ? Math.max(...used) : 0) + 1;
    return `${prefix}${String(next).padStart(4, "0")}`;
}

export type CreateContractInput = {
    name: string;
    clientName: string;
    accountManager?: string;
    startDate?: string;
    endDate?: string;
    status?: ContractStatus;
    phases?: ContractPhase[];
    requirements?: Requirement[];
    crew?: Crew;
    stage?: ContractStage;
    reference?: string;
    quotationId?: string | null;
    valueMyr?: number;
    signedAt?: string | null;
    signedBy?: string;
    fileUrl?: string;
    terms?: string;
    billing?: Partial<ContractBilling>;
    notes?: string;
};

export function buildContract(input: CreateContractInput, code: string): Contract {
    const now = new Date().toISOString();
    return {
        id: randomUUID(),
        code,
        name: input.name,
        clientName: input.clientName,
        accountManager: input.accountManager ?? "",
        status: input.status ?? "draft",
        phases: normalizePhases(input.phases),
        requirements: normalizeRequirements(input.requirements),
        crew: normalizeCrew(input.crew),
        handover: null,
        stage: input.stage ?? (input.signedAt ? "signed" : "created"),
        startDate: input.startDate ?? now.slice(0, 10),
        endDate: input.endDate ?? "",
        reference: input.reference ?? "",
        quotationId: input.quotationId ?? null,
        valueMyr: input.valueMyr ?? 0,
        signedAt: input.signedAt ?? null,
        signedBy: input.signedBy ?? "",
        fileUrl: input.fileUrl ?? "",
        terms: input.terms ?? "",
        billing: { ...emptyBilling(), ...(input.billing ?? {}) },
        notes: input.notes ?? "",
        createdAt: now,
        updatedAt: now,
    };
}

export async function createContract(input: CreateContractInput): Promise<Contract> {
    return writeContract(buildContract(input, await nextContractCode()));
}

export async function listContracts(): Promise<Contract[]> {
    await ensureDir();
    const entries = await fs.readdir(DIR);
    const out: Contract[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const raw = await fs.readFile(path.join(DIR, entry), "utf8");
        out.push(normalizeContract(JSON.parse(raw)));
    }
    return sortContracts(out);
}

export async function getContractById(id: string): Promise<Contract | null> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        return normalizeContract(JSON.parse(raw));
    } catch {
        return null;
    }
}

export type ContractPatch = Partial<Omit<Contract, "id" | "code" | "createdAt">>;

export async function updateContract(id: string, patch: ContractPatch): Promise<Contract> {
    const existing = await getContractById(id);
    if (!existing) throw new Error(`Contract ${id} not found`);
    return writeContract({ ...existing, ...patch, updatedAt: new Date().toISOString() });
}

export async function deleteContract(id: string): Promise<void> {
    try {
        await fs.unlink(fileFor(id));
    } catch {
        // ignore
    }
}
