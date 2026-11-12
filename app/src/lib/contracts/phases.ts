/**
 * Phases as a list people edit: a name, which month it starts (1 = the
 * project's first month) and how many months it runs. Templates and the
 * New project form hold them in this relative form; a project turns them into
 * real YYYY-MM spans against its start date. Pure, no I/O.
 */
import type { PlannerPhase } from "@/lib/dev-store/planners";

export type TemplatePhase = {
    /** Stable id within the list ("kickoff"); made from the name when missing. */
    key: string;
    name: string;
    /** One line on what happens in it; optional. */
    summary: string;
    /** 1-based month the phase starts in. */
    fromMonth: number;
    /** How many months it runs (at least 1). */
    months: number;
};

export const MAX_PHASE_MONTHS = 36;

/** "QA & launch" → "qa-launch". */
export function phaseKey(name: string): string {
    return (
        name
            .toLowerCase()
            .replace(/&/g, " and ")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "phase"
    );
}

/** The built-in list a custom project starts from. */
export const DEFAULT_TEMPLATE_PHASES: TemplatePhase[] = [
    { key: "kickoff", name: "Kickoff", summary: "Onboarding, access, strategy sign-off.", fromMonth: 1, months: 1 },
    { key: "production", name: "Production", summary: "Monthly posts, campaigns and articles.", fromMonth: 1, months: 3 },
    { key: "review", name: "Review", summary: "Performance review and the next plan.", fromMonth: 3, months: 1 },
];

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

export function normalizeTemplatePhase(raw: unknown, index: number, taken: Set<string>): TemplatePhase | null {
    const r = raw as Partial<TemplatePhase> | null;
    const name = String(r?.name ?? "").trim();
    if (!name) return null;
    let key = String(r?.key ?? "").trim() || phaseKey(name);
    while (taken.has(key)) key = `${key}-${index + 1}`;
    taken.add(key);
    return {
        key,
        name,
        summary: String(r?.summary ?? "").trim(),
        fromMonth: clampInt(r?.fromMonth, 1, MAX_PHASE_MONTHS, 1),
        months: clampInt(r?.months, 1, MAX_PHASE_MONTHS, 1),
    };
}

export function normalizeTemplatePhases(raw: unknown): TemplatePhase[] {
    if (!Array.isArray(raw)) return [];
    const taken = new Set<string>();
    const out: TemplatePhase[] = [];
    raw.forEach((r, i) => {
        const p = normalizeTemplatePhase(r, i, taken);
        if (p) out.push(p);
    });
    return out;
}

/** YYYY-MM of `start` plus `offset` months. */
export function shiftMonth(ym: string, offset: number): string {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + offset, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The project's phases from the relative list: month 1 is the start month.
 * With an end date, spans are clipped to the term (a phase starting after the
 * end is dropped).
 */
export function phasesForProject(rows: TemplatePhase[], startDate: string, endDate = ""): PlannerPhase[] {
    const startYm = startDate.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(startYm)) return rows.map((p) => ({ key: p.key, name: p.name, summary: p.summary, startMonth: "", endMonth: "" }));
    const lastYm = endDate ? endDate.slice(0, 7) : "";
    const out: PlannerPhase[] = [];
    for (const p of rows) {
        const s = shiftMonth(startYm, p.fromMonth - 1);
        if (lastYm && s > lastYm) continue;
        let e = shiftMonth(startYm, p.fromMonth - 1 + p.months - 1);
        if (lastYm && e > lastYm) e = lastYm;
        out.push({ key: p.key, name: p.name, summary: p.summary, startMonth: s, endMonth: e });
    }
    return out;
}

/** Back from a project's phases to the relative list (for "save as template" later). */
export function templatePhasesFromProject(phases: PlannerPhase[], startDate: string): TemplatePhase[] {
    const startYm = startDate.slice(0, 7);
    const monthsBetween = (a: string, b: string) => {
        const [ay, am] = a.split("-").map(Number);
        const [by, bm] = b.split("-").map(Number);
        return (by - ay) * 12 + (bm - am);
    };
    return phases.map((p) => {
        const from = p.startMonth && /^\d{4}-\d{2}$/.test(startYm) ? monthsBetween(startYm, p.startMonth) + 1 : 1;
        const len = p.startMonth && p.endMonth ? monthsBetween(p.startMonth, p.endMonth) + 1 : 1;
        return { key: p.key, name: p.name, summary: p.summary ?? "", fromMonth: Math.max(1, from), months: Math.max(1, len) };
    });
}

/** "Kickoff (m1) · Production (m1–3) · Review (m3)". */
export function templatePhasesLabel(rows: TemplatePhase[]): string {
    return rows
        .map((p) => `${p.name} (m${p.fromMonth}${p.months > 1 ? `–${p.fromMonth + p.months - 1}` : ""})`)
        .join(" · ");
}
