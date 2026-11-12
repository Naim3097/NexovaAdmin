/**
 * Deliverables: what a project (or a template) promises, as free rows.
 * "Awareness post on Instagram, 4 a week", "Viral issue post, once".
 * Pure, no I/O, so the row editor (a client component) can import it; the
 * dev store re-exports it.
 */
import { LINE_TYPE_LABEL, toLineType, type LineType } from "@/lib/planners/vocab";

/** How often: every working week, every month, or once (in the first month). */
export const REQUIREMENT_PERS = ["week", "month", "once"] as const;
export type RequirementPer = (typeof REQUIREMENT_PERS)[number];
export const PER_LABEL: Record<RequirementPer, string> = { week: "a week", month: "a month", once: "once" };
/** Short form for lists: "4/wk", "2/mo", "once". */
export const PER_SHORT: Record<RequirementPer, string> = { week: "/wk", month: "/mo", once: " (once)" };

export type Requirement = {
    type: LineType;
    /** What it is called; becomes the task title. "" falls back to the type label. */
    name: string;
    /** Tasks per week / per month, or in total when once. */
    count: number;
    per: RequirementPer;
    /** Channel hint for generated tasks ("Instagram", "Meta", "Blog"); "" = default per type. */
    channel: string;
};

/** Channel a task type lands on when the row does not say. */
export const DEFAULT_CHANNEL: Record<LineType, string> = {
    campaign: "Meta",
    static: "Instagram",
    video: "Instagram",
    seo: "Blog",
    website: "Website",
    custom: "Meeting",
};

/** Website work is usually a one-off; the rest repeats monthly. */
export const ONCE_BY_DEFAULT: ReadonlySet<LineType> = new Set<LineType>(["website"]);

export function isRequirementPer(v: unknown): v is RequirementPer {
    return typeof v === "string" && (REQUIREMENT_PERS as readonly string[]).includes(v);
}

/** Rows written by an older shape used `cadence: "monthly" | "once"` and had no name. */
type LegacyRequirement = Partial<Requirement> & { cadence?: string };

export function normalizeRequirement(raw: unknown): Requirement | null {
    const r = raw as LegacyRequirement | null;
    if (!r || !r.type) return null;
    const type = toLineType(r.type, String(r.name ?? ""), "custom");
    const count = Math.max(0, Math.round(Number(r.count) || 0));
    if (count <= 0) return null;
    const per: RequirementPer = isRequirementPer(r.per) ? r.per : r.cadence === "once" ? "once" : "month";
    return {
        type,
        name: String(r.name ?? "").trim(),
        count,
        per,
        channel: String(r.channel ?? "").trim(),
    };
}

export function normalizeRequirements(raw: unknown): Requirement[] {
    if (!Array.isArray(raw)) return [];
    const out: Requirement[] = [];
    for (const r of raw) {
        const n = normalizeRequirement(r);
        if (n) out.push(n);
    }
    return out;
}

/** The row's display name: what was typed, else the type label. */
export function requirementName(r: Pick<Requirement, "type" | "name">): string {
    return r.name.trim() || LINE_TYPE_LABEL[r.type];
}

/** "Awareness post on Instagram · 4/wk". */
export function requirementLabel(r: Requirement): string {
    return `${requirementName(r)} · ${r.per === "once" ? (r.count === 1 ? "once" : `${r.count} once`) : `${r.count}${PER_SHORT[r.per]}`}`;
}

/** The scope in one line: "Awareness post on Instagram · 4/wk · Blog article · 2/mo · Website · once". */
export function requirementsLabel(reqs: Requirement[], sep = " · "): string {
    return reqs.filter((r) => r.count > 0).map(requirementLabel).join(sep);
}

/** Roughly how many tasks a row yields in a month: weekly rows count four working weeks. */
export function tasksPerMonth(r: Requirement): number {
    if (r.per === "week") return r.count * 4;
    if (r.per === "month") return r.count;
    return 0;
}
