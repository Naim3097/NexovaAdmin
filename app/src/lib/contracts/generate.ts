/**
 * From requirements to tasks. Server-side only (reads/writes the data layer),
 * not a server-action module, so the seed script can use it too.
 *
 *   contract.requirements ("Awareness post on Instagram, 4 a week · Blog
 *   article, 2 a month · Website, once")
 *     × project months
 *     → one task per item, titled from the row, with the phase of its month,
 *       a due day spread through the month (or across each working week),
 *       the crew member per seat and their hours
 *     → plus the post / campaign / article record the task is done in.
 *
 * Generation is idempotent: a whole-scope run skips months that already have
 * generated tasks, so "add next month" is safe to repeat; a single-row run
 * (a deliverable added later, `onlyIndex`) fills the months it is given and
 * skips any task whose key already exists.
 */
import { createWork, updateWork, type CreateWorkInput, type LinkedItem, type Work } from "@/lib/data/works";
import { createContentPost, type ContentPlatform } from "@/lib/data/content";
import { createCampaign, type CampaignPlatform } from "@/lib/data/campaigns";
import { createSeoArticle } from "@/lib/data/seo-articles";
import type { Contract, Crew, Requirement } from "@/lib/data/contracts";
import type { TeamMember } from "@/lib/data/team";
import { DEFAULT_SPLIT, SEATS, SEAT_CATEGORIES, defaultApprover, type LineType, type Seat } from "@/lib/data/planners";
import { phaseForMonth } from "@/lib/planners/helpers";
import { daysInMonth, dateForDay, monthRange, nextMonth, primaryMember, todayKey } from "@/lib/works/helpers";
import { WORK_DAYS, loadFor, nearestWorkingDay, withHours } from "@/lib/capacity/helpers";

// The default channel per task type lives with the deliverable shape (pure, client-safe); re-exported here.
import { DEFAULT_CHANNEL, requirementName } from "@/lib/contracts/requirements";
export { DEFAULT_CHANNEL };

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
 * Months the project runs: start → end. Open-ended projects get `aheadIfOpen`
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

/** Months in the project span that have no generated task yet. */
export function monthsToGenerate(c: Pick<Contract, "startDate" | "endDate">, existing: Work[]): string[] {
    const done = new Set(existing.filter(isGenerated).map((w) => w.month));
    return contractMonths(c).filter((m) => !done.has(m));
}

/**
 * Propose a crew: one person per seat, the least loaded active member whose
 * company role fits the seat; the AM seat is the project's account manager.
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
        const categories = SEAT_CATEGORIES[seat];
        const candidates = active.filter((m) => categories.includes(m.category));
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

/** JS weekday (0 = Sunday) of a YYYY-MM-DD. */
function weekdayOf(ymd: string): number {
    return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

/** `n` due dates spread evenly through the month, each on a working day. */
function spreadThroughMonth(month: string, n: number): string[] {
    const dim = daysInMonth(month);
    const out: string[] = [];
    for (let i = 1; i <= n; i += 1) {
        out.push(nearestWorkingDay(dateForDay(month, Math.max(1, Math.min(dim, Math.round((i * dim) / (n + 1)))))));
    }
    return out;
}

/**
 * Weekly rows: for every Monday inside the month, `perWeek` due dates spread
 * across that week's working days (Mon–Thu), kept inside the month. One a
 * week lands mid-week; four fill Mon, Tue, Wed, Thu. A week cut off by the
 * month's end spreads over the days it has left.
 */
function spreadThroughWeeks(month: string, perWeek: number): string[] {
    const dim = daysInMonth(month);
    const out: string[] = [];
    for (let d = 1; d <= dim; d += 1) {
        if (weekdayOf(dateForDay(month, d)) !== 1) continue; // not a Monday
        const slots = Math.min(WORK_DAYS.length, dim - d + 1);
        for (let i = 1; i <= perWeek; i += 1) {
            const offset = Math.min(slots - 1, Math.floor(((i - 0.5) * slots) / perWeek));
            out.push(nearestWorkingDay(dateForDay(month, d + offset)));
        }
    }
    return out;
}

/**
 * The due dates a requirement row yields in a given month of the span, in
 * order: "month" spreads `count` through the month, "week" puts `count` in
 * every week whose Monday falls in the month, "once" lands `count` in the
 * first month only.
 */
function dueDatesFor(r: Requirement, month: string, firstMonth: string): string[] {
    if (r.per === "week") return spreadThroughWeeks(month, r.count);
    if (r.per === "month") return spreadThroughMonth(month, r.count);
    return month === firstMonth ? spreadThroughMonth(month, r.count) : [];
}

/**
 * Pure: the task inputs a project needs for the given months (no I/O).
 * With `onlyIndex`, only that requirement row is generated (a deliverable
 * added to a running project); its one-off ("once") lands in the first of
 * the given months rather than the project's first month.
 */
export function tasksFromRequirements(
    c: Pick<Contract, "id" | "clientName" | "accountManager" | "phases" | "requirements" | "crew" | "startDate" | "endDate">,
    team: TeamMember[],
    months: string[],
    onlyIndex?: number,
): CreateWorkInput[] {
    const firstMonth = (onlyIndex === undefined ? contractMonths(c)[0] : [...months].sort()[0]) ?? months[0] ?? todayKey().slice(0, 7);
    const out: CreateWorkInput[] = [];
    for (const month of months) {
        const phase = phaseForMonth({ phases: c.phases }, month);
        for (const [ri, r] of c.requirements.entries()) {
            if (onlyIndex !== undefined && ri !== onlyIndex) continue;
            // Nothing is due before the project starts: in the start month, repeating
            // rows drop the earlier dates and a one-off moves up to the first working day.
            const startsHere = Boolean(c.startDate) && month === c.startDate.slice(0, 7);
            const raw = dueDatesFor(r, month, firstMonth);
            const dues = !startsHere
                ? raw
                : r.per === "once"
                  ? raw.map((d) => (d < c.startDate ? nearestWorkingDay(c.startDate) : d))
                  : raw.filter((d) => d >= c.startDate);
            const n = dues.length;
            const name = requirementName(r);
            dues.forEach((dueDate, idx) => {
                const i = idx + 1;
                out.push({
                    contractId: c.id,
                    clientName: c.clientName,
                    accountManager: c.accountManager,
                    plannerLineId: generatedKey(r.type, month, ri, i),
                    type: r.type,
                    // "Awareness post on Instagram · 3/16" when the row yields more than one task this month.
                    title: n > 1 ? `${name} · ${i}/${n}` : name,
                    channel: r.channel || DEFAULT_CHANNEL[r.type],
                    month,
                    phaseKey: phase?.key ?? "",
                    phaseName: phase?.name ?? "",
                    dueDate,
                    split: crewSplit(r.type, c, team),
                    approver: defaultApprover(r.type),
                    milestone: r.per === "once",
                    notes: "",
                });
            });
        }
    }
    return out;
}

/** Create the record in Contents / Campaigns / SEO where the task is done. Website and other items live on the task alone. */
export async function createLinkedItem(work: Work): Promise<LinkedItem | null> {
    const assignee = primaryMember(work);
    if (work.type === "static" || work.type === "video") {
        const post = await createContentPost({
            title: work.title,
            type: work.type === "video" ? "reel" : "post",
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
 * months that already have generated tasks. With `onlyIndex` only that
 * requirement row is generated, into exactly the months given (they already
 * have the other rows' tasks); a task whose key exists is never made twice.
 * Returns the created works.
 */
export async function generateContractTasks(
    c: Contract,
    team: TeamMember[],
    existing: Work[],
    months?: string[],
    opts: { onlyIndex?: number } = {},
): Promise<Work[]> {
    const done = new Set(existing.filter(isGenerated).map((w) => w.month));
    const target = opts.onlyIndex === undefined ? (months ?? monthsToGenerate(c, existing)).filter((m) => !done.has(m)) : (months ?? []);
    const taken = new Set(existing.map((w) => w.plannerLineId).filter(Boolean));
    const created: Work[] = [];
    for (const input of tasksFromRequirements(c, team, target, opts.onlyIndex)) {
        if (input.plannerLineId && taken.has(input.plannerLineId)) continue;
        const w = await createWork(input);
        const linked = await createLinkedItem(w);
        created.push(linked ? await updateWork(w.id, { linked }) : w);
    }
    return created;
}
