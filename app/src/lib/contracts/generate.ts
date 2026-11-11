/**
 * From requirements to tasks. Server-side only (reads/writes the data layer),
 * not a server-action module, so the seed script can use it too.
 *
 *   contract.requirements ("3 posts a month, 1 campaign a month, 1 website")
 *     × contract months
 *     → one task per item, with the phase of its month, a due day spread
 *       through the month, the crew member per seat and their hours
 *     → plus the post / campaign / article record the task is done in.
 *
 * Generation is idempotent per (month, type): months that already have
 * generated tasks are skipped, so "add next month" is safe to repeat.
 */
import { createWork, updateWork, type CreateWorkInput, type LinkedItem, type Work } from "@/lib/data/works";
import { createContentPost, type ContentPlatform } from "@/lib/data/content";
import { createCampaign, type CampaignPlatform } from "@/lib/data/campaigns";
import { createSeoArticle } from "@/lib/data/seo-articles";
import type { Contract, Crew, Requirement } from "@/lib/data/contracts";
import type { TeamMember } from "@/lib/data/team";
import { DEFAULT_SPLIT, LINE_TYPE_LABEL, SEATS, SEAT_ROLES, type LineType, type Seat } from "@/lib/data/planners";
import { phaseForMonth } from "@/lib/planners/helpers";
import { daysInMonth, dateForDay, monthRange, nextMonth, primaryMember, todayKey } from "@/lib/works/helpers";
import { loadFor, nearestWorkingDay, withHours } from "@/lib/capacity/helpers";

export const DEFAULT_CHANNEL: Record<LineType, string> = {
    post: "Instagram",
    campaign: "Meta",
    seo: "Blog",
    website: "Website",
    branding: "Brand",
    custom: "Meeting",
};

const CONTENT_PLATFORMS: ContentPlatform[] = ["instagram", "facebook", "tiktok", "linkedin", "x", "youtube", "blog", "newsletter"];
const CAMPAIGN_PLATFORMS: CampaignPlatform[] = ["meta", "google", "tiktok", "linkedin", "x", "youtube", "other"];

function contentPlatform(channel: string): ContentPlatform {
    const c = channel.toLowerCase();
    if (c.includes("twitter")) return "x";
    return CONTENT_PLATFORMS.find((p) => c.includes(p)) ?? "instagram";
}

function campaignPlatform(channel: string): CampaignPlatform {
    const c = channel.toLowerCase();
    if (c.includes("facebook") || c.includes("instagram")) return "meta";
    return CAMPAIGN_PLATFORMS.find((p) => c.includes(p)) ?? "meta";
}

/** Marker stored in `plannerLineId` on generated tasks: req:<type>:<month>:<requirement index>:<n>. */
export function generatedKey(type: LineType, month: string, requirementIndex: number, n: number): string {
    return `req:${type}:${month}:${requirementIndex}:${n}`;
}
export function isGenerated(w: Pick<Work, "plannerLineId">): boolean {
    return Boolean(w.plannerLineId?.startsWith("req:"));
}

function addMonths(month: string, n: number): string {
    let m = month;
    for (let i = 0; i < n; i += 1) m = nextMonth(m);
    return m;
}

/**
 * Months the contract runs: start → end. Open-ended contracts get `aheadIfOpen`
 * months from the start (more are added with "add next month"). Capped at `max`.
 */
export function contractMonths(c: Pick<Contract, "startDate" | "endDate">, opts: { aheadIfOpen?: number; max?: number } = {}): string[] {
    const aheadIfOpen = opts.aheadIfOpen ?? 3;
    const max = opts.max ?? 12;
    const start = (c.startDate || todayKey()).slice(0, 7);
    const end = c.endDate ? c.endDate.slice(0, 7) : addMonths(start, Math.max(0, aheadIfOpen - 1));
    const months = end < start ? [start] : monthRange(start, end);
    return months.slice(0, max);
}

/** Months in the contract span that have no generated task yet. */
export function monthsToGenerate(c: Pick<Contract, "startDate" | "endDate">, existing: Work[]): string[] {
    const done = new Set(existing.filter(isGenerated).map((w) => w.month));
    return contractMonths(c).filter((m) => !done.has(m));
}

/**
 * Propose a crew: one person per seat, the least loaded active member whose
 * company role fits the seat; the AM seat is the contract's account manager.
 */
export function proposeCrew(
    c: Pick<Contract, "accountManager">,
    team: TeamMember[],
    works: Work[],
    month = todayKey().slice(0, 7),
): Crew {
    const crew: Crew = {};
    const active = team.filter((m) => m.active);
    for (const seat of SEATS) {
        if (seat === "am" && c.accountManager) {
            crew.am = c.accountManager;
            continue;
        }
        const roles = SEAT_ROLES[seat];
        const candidates = active.filter((m) => (roles as readonly string[]).includes(m.role));
        if (candidates.length === 0) continue;
        const best = [...candidates].sort((a, b) => loadFor(a, works, month).ratio - loadFor(b, works, month).ratio)[0];
        if (best) crew[seat] = best.name;
    }
    return crew;
}

/** Fill the seats a type needs from the crew, with hours from each person's table. */
export function crewSplit(type: LineType, c: Pick<Contract, "crew" | "accountManager">, team: TeamMember[]) {
    return withHours(
        DEFAULT_SPLIT[type].map((s) => ({
            seat: s.seat as Seat,
            pct: s.pct,
            member: c.crew[s.seat as Seat] ?? (s.seat === "am" ? c.accountManager : ""),
        })),
        team,
        type,
    );
}

/** Count of tasks a requirement yields in a given month of the span. */
function countFor(r: Requirement, month: string, firstMonth: string): number {
    if (r.cadence === "monthly") return r.count;
    return month === firstMonth ? r.count : 0;
}

/** Pure: the task inputs a contract needs for the given months (no I/O). */
export function tasksFromRequirements(
    c: Pick<Contract, "id" | "clientName" | "accountManager" | "phases" | "requirements" | "crew" | "startDate" | "endDate">,
    team: TeamMember[],
    months: string[],
): CreateWorkInput[] {
    const firstMonth = contractMonths(c)[0] ?? months[0] ?? todayKey().slice(0, 7);
    const out: CreateWorkInput[] = [];
    for (const month of months) {
        const phase = phaseForMonth({ phases: c.phases }, month);
        const dim = daysInMonth(month);
        for (const [ri, r] of c.requirements.entries()) {
            const n = countFor(r, month, firstMonth);
            for (let i = 1; i <= n; i += 1) {
                const label = LINE_TYPE_LABEL[r.type];
                out.push({
                    contractId: c.id,
                    clientName: c.clientName,
                    accountManager: c.accountManager,
                    plannerLineId: generatedKey(r.type, month, ri, i),
                    type: r.type,
                    title: n > 1 ? `${label} ${i} of ${n}` : label,
                    channel: r.channel || DEFAULT_CHANNEL[r.type],
                    month,
                    phaseKey: phase?.key ?? "",
                    phaseName: phase?.name ?? "",
                    dueDate: nearestWorkingDay(dateForDay(month, Math.max(1, Math.min(dim, Math.round((i * dim) / (n + 1)))))),
                    split: crewSplit(r.type, c, team),
                    approver: r.type === "post" || r.type === "branding" ? "client" : "am",
                    milestone: r.cadence === "once",
                    notes: "",
                });
            }
        }
    }
    return out;
}

/** Create the record in Contents / Campaigns / SEO where the task is done. Website, branding and custom items live on the task alone. */
export async function createLinkedItem(work: Work): Promise<LinkedItem | null> {
    const assignee = primaryMember(work);
    if (work.type === "post") {
        const post = await createContentPost({
            title: work.title,
            clientName: work.clientName,
            contractId: work.contractId,
            platform: contentPlatform(work.channel),
            scheduledFor: work.dueDate,
            assignee,
            planMonth: work.month,
            origin: "plan",
            notes: work.notes,
        });
        return { kind: "content", id: post.id };
    }
    if (work.type === "campaign") {
        const camp = await createCampaign({
            name: work.title,
            clientName: work.clientName,
            contractId: work.contractId,
            platform: campaignPlatform(work.channel),
            startDate: work.dueDate,
            notes: work.notes,
        });
        return { kind: "campaign", id: camp.id };
    }
    if (work.type === "seo") {
        const art = await createSeoArticle({
            title: work.title,
            clientName: work.clientName,
            brief: work.notes,
            assignee,
            targetDate: work.dueDate,
        });
        return { kind: "seo", id: art.id };
    }
    return null;
}

/**
 * Generate the tasks (and linked records) for the given months, skipping
 * months that already have generated tasks. Returns the created works.
 */
export async function generateContractTasks(c: Contract, team: TeamMember[], existing: Work[], months?: string[]): Promise<Work[]> {
    const target = months ?? monthsToGenerate(c, existing);
    const done = new Set(existing.filter(isGenerated).map((w) => w.month));
    const created: Work[] = [];
    for (const input of tasksFromRequirements(c, team, target.filter((m) => !done.has(m)))) {
        const w = await createWork(input);
        const linked = await createLinkedItem(w);
        created.push(linked ? await updateWork(w.id, { linked }) : w);
    }
    return created;
}
