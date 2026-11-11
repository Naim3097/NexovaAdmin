/**
 * DEV-ONLY local file store for content planners.
 * Replaced by Supabase `planners` table once provisioned.
 *
 * A PLANNER is the scope document of an engagement. The consultant (whoever is
 * assigned to the pipeline deal) writes it, sales presents it beside the
 * quotation, and the accepted version is frozen into the contract: every line
 * on the planner becomes one task (a post, a campaign, an SEO article, a
 * website item …) under that contract. After acceptance the planner only
 * changes through an addendum (a new version), which adds or removes tasks.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { devDataRoot } from "@/lib/dev-store/root";
import { randomUUID } from "node:crypto";
import type { TeamRole } from "@/lib/dev-store/team";

const ROOT = devDataRoot();
const DIR = path.join(ROOT, "planners");

// ---------------------------------------------------------------------------
// Vocabulary shared with works (tasks)
// ---------------------------------------------------------------------------

/** What one planner line / task is. */
export const LINE_TYPES = ["post", "campaign", "seo", "website", "branding", "custom"] as const;
export type LineType = (typeof LINE_TYPES)[number];
export const LINE_TYPE_LABEL: Record<LineType, string> = {
    post: "Content post",
    campaign: "Campaign",
    seo: "SEO article",
    website: "Website item",
    branding: "Branding item",
    custom: "Other task",
};
export const LINE_TYPE_SHORT: Record<LineType, string> = {
    post: "Post",
    campaign: "Campaign",
    seo: "SEO",
    website: "Website",
    branding: "Branding",
    custom: "Other",
};
export function isLineType(v: string): v is LineType {
    return (LINE_TYPES as readonly string[]).includes(v);
}

/** Who holds a share of a task. Resolved to a team member at acceptance. */
export const SEATS = ["dm", "creative", "dev", "seo", "am"] as const;
export type Seat = (typeof SEATS)[number];
export const SEAT_LABEL: Record<Seat, string> = {
    dm: "Digital marketer",
    creative: "Creative",
    dev: "Developer",
    seo: "SEO specialist",
    am: "Account manager",
};
export const SEAT_SHORT: Record<Seat, string> = { dm: "DM", creative: "Creative", dev: "Dev", seo: "SEO", am: "AM" };
/** Team roles that can hold each seat, in order of preference. */
export const SEAT_ROLES: Record<Seat, TeamRole[]> = {
    dm: ["Content", "Ads"],
    creative: ["UI/UX", "Content"],
    dev: ["Frontend", "Backend"],
    seo: ["SEO", "Content"],
    am: ["PM", "CEO"],
};
export function isSeat(v: string): v is Seat {
    return (SEATS as readonly string[]).includes(v);
}

export type SplitShare = { seat: Seat; pct: number };

/** Responsibility split the consultant starts from for each type. */
export const DEFAULT_SPLIT: Record<LineType, SplitShare[]> = {
    post: [
        { seat: "dm", pct: 50 },
        { seat: "creative", pct: 50 },
    ],
    campaign: [{ seat: "dm", pct: 100 }],
    seo: [
        { seat: "seo", pct: 50 },
        { seat: "dm", pct: 50 },
    ],
    website: [{ seat: "dev", pct: 100 }],
    branding: [{ seat: "creative", pct: 100 }],
    custom: [{ seat: "am", pct: 100 }],
};

/** Who signs a task off. "client" goes through the account manager (portal). */
export const APPROVERS = ["none", "am", "client"] as const;
export type Approver = (typeof APPROVERS)[number];
/** Who signs a task off. */
export const APPROVER_LABEL: Record<Approver, string> = {
    none: "None",
    am: "Account manager",
    client: "Client",
};
export function isApprover(v: string): v is Approver {
    return (APPROVERS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Planner shape
// ---------------------------------------------------------------------------

export const PLANNER_STATUSES = ["draft", "presented", "accepted"] as const;
export type PlannerStatus = (typeof PLANNER_STATUSES)[number];
export const PLANNER_STATUS_LABEL: Record<PlannerStatus, string> = {
    draft: "Draft",
    presented: "Presented",
    accepted: "Accepted",
};

export type PlannerPhase = {
    key: string;
    /** Editable per planner — "Kickoff", "Foundation", "Production" … */
    name: string;
    summary: string;
    /** YYYY-MM, "" = not set. */
    startMonth: string;
    endMonth: string;
};

/** Stable key for a phase name: "QA & launch" → "qa-launch". Falls back to a random suffix when empty. */
export function phaseKeyFrom(name: string): string {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug || `phase-${randomUUID().slice(0, 8)}`;
}

export function normalizePhase(raw: Partial<PlannerPhase> | null | undefined): PlannerPhase {
    const name = String(raw?.name ?? "").trim();
    return {
        key: String(raw?.key ?? "").trim() || phaseKeyFrom(name),
        name,
        summary: String(raw?.summary ?? ""),
        startMonth: String(raw?.startMonth ?? ""),
        endMonth: String(raw?.endMonth ?? ""),
    };
}

export function normalizePhases(raw: unknown): PlannerPhase[] {
    return Array.isArray(raw) ? raw.map((ph) => normalizePhase(ph as Partial<PlannerPhase>)) : [];
}

export type PlannerObjective = {
    id: string;
    text: string;
    /** How it is measured ("+1,200 followers", "20 leads / month"). */
    measure: string;
};

export type PlannerLine = {
    id: string;
    type: LineType;
    title: string;
    /** Instagram, TikTok, Google Ads, Website … free text. */
    channel: string;
    /** YYYY-MM the item is delivered in. */
    month: string;
    phaseKey: string;
    split: SplitShare[];
    approver: Approver;
    /** Shown on the timeline as a milestone ("Website live"). */
    milestone: boolean;
    /** Day of the month the item is due (1–28). */
    dueDay: number;
    note: string;
};

export const PAYMENT_MODELS = ["deposit_monthly", "monthly", "milestone", "one_off"] as const;
export type PaymentModel = (typeof PAYMENT_MODELS)[number];
export const PAYMENT_MODEL_LABEL: Record<PaymentModel, string> = {
    deposit_monthly: "Deposit, then monthly",
    monthly: "Monthly",
    milestone: "By milestone",
    one_off: "One-off",
};
export function isPaymentModel(v: string): v is PaymentModel {
    return (PAYMENT_MODELS as readonly string[]).includes(v);
}

export type ScheduleRow = {
    id: string;
    label: string;
    dueDate: string; // YYYY-MM-DD
    amountMyr: number;
    /** Invoice raised for this row at acceptance. null = not raised. */
    invoiceId: string | null;
};

export type PlannerPayment = {
    model: PaymentModel;
    /** Percent of the total due on signing (deposit models). */
    depositPct: number;
    rows: ScheduleRow[];
};

export type Addendum = {
    version: number;
    note: string;
    by: string;
    at: string;
    /** Change to the investment (MYR, may be negative). */
    investmentDeltaMyr: number;
};

export type Planner = {
    id: string;
    /** Pipeline deal this planner was written for. null = written on the contract. */
    leadId: string | null;
    clientName: string;
    /** The consultant: whoever is assigned to the deal / contract. */
    preparedBy: string;
    /** Engagement title — becomes the contract name. */
    title: string;
    version: number;
    status: PlannerStatus;
    // 2 · Our understanding
    understanding: string;
    // 3 · Objectives
    objectives: PlannerObjective[];
    // 5 · Content plan
    /** One pillar per line. */
    pillars: string;
    /** Channels and cadence, free text. */
    channels: string;
    phases: PlannerPhase[];
    lines: PlannerLine[];
    // 8 · Investment
    quotationId: string | null;
    payment: PlannerPayment;
    /** One per line, e.g. "Meta ad spend — billed at cost". */
    thirdPartyCosts: string;
    // 9 · Terms and assumptions
    assumptions: string;
    clientResponsibilities: string;
    exclusions: string;
    terms: string;
    /** Working days the client has to review a deliverable. */
    reviewDays: number;
    /** Rounds of changes included per deliverable. */
    changeRounds: number;
    validUntil: string; // YYYY-MM-DD, "" = none
    presentedAt: string | null;
    acceptedAt: string | null;
    acceptedBy: string;
    /** Contract the accepted planner was frozen into. */
    contractId: string | null;
    addenda: Addendum[];
    createdAt: string;
    updatedAt: string;
};

export function defaultPhases(): PlannerPhase[] {
    return [
        { key: "kickoff", name: "Kickoff", summary: "Onboarding, brand audit, access, strategy sign-off.", startMonth: "", endMonth: "" },
        { key: "foundation", name: "Foundation", summary: "Branding, website and account setup.", startMonth: "", endMonth: "" },
        { key: "production", name: "Production", summary: "Monthly posts, campaigns and articles.", startMonth: "", endMonth: "" },
        { key: "review", name: "Review", summary: "Performance review, renewal proposal, next plan.", startMonth: "", endMonth: "" },
    ];
}

export function emptyPayment(): PlannerPayment {
    return { model: "deposit_monthly", depositPct: 30, rows: [] };
}

export function normalizeLine(raw: Partial<PlannerLine> & { id: string }): PlannerLine {
    const type = raw.type && isLineType(raw.type) ? raw.type : "post";
    return {
        id: raw.id,
        type,
        title: raw.title ?? "",
        channel: raw.channel ?? "",
        month: raw.month ?? "",
        phaseKey: raw.phaseKey ?? "",
        split: (raw.split ?? DEFAULT_SPLIT[type]).map((s) => ({ seat: s.seat, pct: Number(s.pct) || 0 })),
        approver: raw.approver && isApprover(raw.approver) ? raw.approver : "am",
        milestone: raw.milestone ?? false,
        dueDay: raw.dueDay ?? 15,
        note: raw.note ?? "",
    };
}

export function normalizePlanner(raw: Partial<Planner> & { id: string }): Planner {
    const now = new Date().toISOString();
    return {
        id: raw.id,
        leadId: raw.leadId ?? null,
        clientName: raw.clientName ?? "",
        preparedBy: raw.preparedBy ?? "",
        title: raw.title ?? "",
        version: raw.version ?? 1,
        status: raw.status ?? "draft",
        understanding: raw.understanding ?? "",
        objectives: raw.objectives ?? [],
        pillars: raw.pillars ?? "",
        channels: raw.channels ?? "",
        phases: Array.isArray(raw.phases) ? normalizePhases(raw.phases) : defaultPhases(),
        lines: (raw.lines ?? []).map(normalizeLine),
        quotationId: raw.quotationId ?? null,
        payment: { ...emptyPayment(), ...(raw.payment ?? {}) },
        thirdPartyCosts: raw.thirdPartyCosts ?? "",
        assumptions: raw.assumptions ?? "",
        clientResponsibilities: raw.clientResponsibilities ?? "",
        exclusions: raw.exclusions ?? "",
        terms: raw.terms ?? "",
        reviewDays: raw.reviewDays ?? 3,
        changeRounds: raw.changeRounds ?? 2,
        validUntil: raw.validUntil ?? "",
        presentedAt: raw.presentedAt ?? null,
        acceptedAt: raw.acceptedAt ?? null,
        acceptedBy: raw.acceptedBy ?? "",
        contractId: raw.contractId ?? null,
        addenda: raw.addenda ?? [],
        createdAt: raw.createdAt ?? now,
        updatedAt: raw.updatedAt ?? now,
    };
}

export type NewLineInput = {
    type: LineType;
    title: string;
    channel?: string;
    month: string;
    phaseKey?: string;
    split?: SplitShare[];
    approver?: Approver;
    milestone?: boolean;
    dueDay?: number;
    note?: string;
};

export function newLine(input: NewLineInput): PlannerLine {
    return normalizeLine({
        id: randomUUID(),
        type: input.type,
        title: input.title,
        channel: input.channel ?? "",
        month: input.month,
        phaseKey: input.phaseKey ?? "",
        split: input.split ?? DEFAULT_SPLIT[input.type],
        approver: input.approver ?? (input.type === "post" || input.type === "branding" ? "client" : "am"),
        milestone: input.milestone ?? false,
        dueDay: input.dueDay ?? 15,
        note: input.note ?? "",
    });
}

export type CreatePlannerInput = {
    leadId?: string | null;
    clientName: string;
    preparedBy?: string;
    title?: string;
    quotationId?: string | null;
    understanding?: string;
    pillars?: string;
    channels?: string;
    phases?: PlannerPhase[];
    lines?: NewLineInput[];
    objectives?: Array<{ text: string; measure: string }>;
    validUntil?: string;
};

export function buildPlanner(input: CreatePlannerInput): Planner {
    const now = new Date().toISOString();
    return normalizePlanner({
        id: randomUUID(),
        leadId: input.leadId ?? null,
        clientName: input.clientName,
        preparedBy: input.preparedBy ?? "",
        title: input.title ?? `${input.clientName} — brand growth engagement`,
        quotationId: input.quotationId ?? null,
        understanding: input.understanding ?? "",
        pillars: input.pillars ?? "",
        channels: input.channels ?? "",
        phases: input.phases ? normalizePhases(input.phases) : defaultPhases(),
        lines: (input.lines ?? []).map(newLine),
        objectives: (input.objectives ?? []).map((o) => ({ id: randomUUID(), text: o.text, measure: o.measure })),
        validUntil: input.validUntil ?? "",
        createdAt: now,
        updatedAt: now,
    });
}

export function sortPlanners(list: Planner[]): Planner[] {
    const rank: Record<PlannerStatus, number> = { presented: 0, draft: 1, accepted: 2 };
    return list.sort((a, b) => rank[a.status] - rank[b.status] || b.updatedAt.localeCompare(a.updatedAt));
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

async function ensureDir() {
    await fs.mkdir(DIR, { recursive: true });
}

function fileFor(id: string) {
    return path.join(DIR, `${id}.json`);
}

async function writePlanner(p: Planner): Promise<Planner> {
    await ensureDir();
    await fs.writeFile(fileFor(p.id), JSON.stringify(p, null, 2), "utf8");
    return p;
}

export async function createPlanner(input: CreatePlannerInput): Promise<Planner> {
    return writePlanner(buildPlanner(input));
}

export async function listPlanners(): Promise<Planner[]> {
    await ensureDir();
    const entries = await fs.readdir(DIR);
    const out: Planner[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const raw = await fs.readFile(path.join(DIR, entry), "utf8");
        out.push(normalizePlanner(JSON.parse(raw)));
    }
    return sortPlanners(out);
}

export async function getPlannerById(id: string): Promise<Planner | null> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        return normalizePlanner(JSON.parse(raw));
    } catch {
        return null;
    }
}

export type PlannerPatch = Partial<Omit<Planner, "id" | "createdAt">>;

export async function updatePlanner(id: string, patch: PlannerPatch): Promise<Planner> {
    const existing = await getPlannerById(id);
    if (!existing) throw new Error(`Planner not found: ${id}`);
    return writePlanner(normalizePlanner({ ...existing, ...patch, id, updatedAt: new Date().toISOString() }));
}

export async function deletePlanner(id: string): Promise<void> {
    try {
        await fs.unlink(fileFor(id));
    } catch {
        // already gone
    }
}
