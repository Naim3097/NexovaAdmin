/**
 * Planner helpers — pure functions shared by the proposal editor, the client
 * view, the contract document and the accept flow. No I/O.
 */
import type { Contract } from "@/lib/data/contracts";
import type { CreateWorkInput } from "@/lib/data/works";
import type { TeamMember } from "@/lib/data/team";
import type { Quotation } from "@/lib/data/quotations";
import { computeTotals } from "@/lib/data/quotations";
import {
    LINE_TYPES,
    type LineType,
    type PaymentModel,
    type Planner,
    type PlannerLine,
    type PlannerPhase,
    type ScheduleRow,
} from "@/lib/data/planners";
import { dateForDay, daysInMonth, monthRange, resolveSplit, splitTotal } from "@/lib/works/helpers";

export function phaseName(p: Pick<Planner, "phases">, key: string): string {
    return p.phases.find((ph) => ph.key === key)?.name ?? "";
}

/** Phase a month falls in by the phase month ranges, else undefined. */
export function phaseForMonth(p: Pick<Planner, "phases">, month: string): PlannerPhase | undefined {
    return p.phases.find((ph) => ph.startMonth && ph.endMonth && ph.startMonth <= month && month <= ph.endMonth);
}

export function lineDueDate(line: Pick<PlannerLine, "month" | "dueDay">): string {
    return line.month ? dateForDay(line.month, line.dueDay) : "";
}

export function monthsOf(lines: PlannerLine[]): string[] {
    return [...new Set(lines.map((l) => l.month).filter(Boolean))].sort();
}

export function linesByMonth(lines: PlannerLine[]): Map<string, PlannerLine[]> {
    const out = new Map<string, PlannerLine[]>();
    for (const l of [...lines].sort((a, b) => a.month.localeCompare(b.month) || a.dueDay - b.dueDay)) {
        out.set(l.month, [...(out.get(l.month) ?? []), l]);
    }
    return new Map([...out.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

export function countsByType(lines: PlannerLine[]): Record<LineType, number> {
    const out = Object.fromEntries(LINE_TYPES.map((t) => [t, 0])) as Record<LineType, number>;
    for (const l of lines) out[l.type] += 1;
    return out;
}

/** "12 posts · 2 campaigns · 4 SEO articles" (only the types present). */
export function countsLabel(lines: PlannerLine[]): string {
    const c = countsByType(lines);
    const words: Record<LineType, [string, string]> = {
        post: ["post", "posts"],
        campaign: ["campaign", "campaigns"],
        seo: ["SEO article", "SEO articles"],
        website: ["website item", "website items"],
        branding: ["branding item", "branding items"],
        custom: ["other task", "other tasks"],
    };
    return LINE_TYPES.filter((t) => c[t] > 0)
        .map((t) => `${c[t]} ${words[t][c[t] === 1 ? 0 : 1]}`)
        .join(" · ");
}

/** First day of the first month to the last day of the last month. */
export function spanOf(p: Pick<Planner, "lines" | "phases">): { start: string; end: string; months: string[] } {
    const months = [
        ...monthsOf(p.lines),
        ...p.phases.flatMap((ph) => [ph.startMonth, ph.endMonth]).filter((m) => /^\d{4}-\d{2}$/.test(m)),
    ].sort();
    if (months.length === 0) return { start: "", end: "", months: [] };
    const first = months[0];
    const last = months[months.length - 1];
    return { start: `${first}-01`, end: `${last}-${String(daysInMonth(last)).padStart(2, "0")}`, months: monthRange(first, last) };
}

export function milestones(p: Pick<Planner, "lines">): PlannerLine[] {
    return p.lines.filter((l) => l.milestone).sort((a, b) => lineDueDate(a).localeCompare(lineDueDate(b)));
}

export function lineList(text: string): string[] {
    return text
        .split(/\r?\n/)
        .map((s) => s.replace(/^[-•*]\s*/, "").trim())
        .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Investment
// ---------------------------------------------------------------------------

export type Investment = {
    subtotal: number;
    tax: number;
    total: number;
    /** Sum of the payment schedule rows. */
    scheduled: number;
    /** Net change from addenda. */
    addenda: number;
    /** total + addenda. */
    current: number;
};

export function investmentOf(p: Pick<Planner, "payment" | "addenda">, quotation: Quotation | null): Investment {
    const totals = quotation ? computeTotals(quotation) : { subtotal: 0, tax: 0, total: 0 };
    const scheduled = +p.payment.rows.reduce((sum, r) => sum + (Number(r.amountMyr) || 0), 0).toFixed(2);
    const addenda = +p.addenda.reduce((sum, a) => sum + (Number(a.investmentDeltaMyr) || 0), 0).toFixed(2);
    return { ...totals, scheduled, addenda, current: +(totals.total + addenda).toFixed(2) };
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/**
 * Default payment schedule for a model. Deposit on signing, the rest spread
 * over the months of the plan; milestone rows land on the milestone dates.
 */
export function buildSchedule(
    model: PaymentModel,
    depositPct: number,
    total: number,
    p: Pick<Planner, "lines" | "phases">,
    signingDate: string,
    newId: () => string,
): ScheduleRow[] {
    const span = spanOf(p);
    const rows: ScheduleRow[] = [];
    const push = (label: string, dueDate: string, amountMyr: number) => rows.push({ id: newId(), label, dueDate, amountMyr: round2(amountMyr), invoiceId: null });
    if (total <= 0) return rows;
    if (model === "one_off" || span.months.length === 0) {
        push("Full payment on signing", signingDate, total);
        return rows;
    }
    if (model === "milestone") {
        const ms = milestones(p);
        if (ms.length === 0) {
            push("Full payment on signing", signingDate, total);
            return rows;
        }
        const each = total / ms.length;
        for (const m of ms) push(`On ${m.title}`, lineDueDate(m), each);
    } else {
        let remainder = total;
        if (model === "deposit_monthly" && depositPct > 0) {
            const deposit = round2((total * depositPct) / 100);
            push(`Deposit ${depositPct}% on signing`, signingDate, deposit);
            remainder = total - deposit;
        }
        const each = remainder / span.months.length;
        for (const month of span.months) push(`Month ${span.months.indexOf(month) + 1} · ${month}`, `${month}-01`, each);
    }
    // Rounding drift lands on the last row.
    const drift = round2(total - rows.reduce((s, r) => s + r.amountMyr, 0));
    if (drift !== 0 && rows.length) rows[rows.length - 1].amountMyr = round2(rows[rows.length - 1].amountMyr + drift);
    return rows;
}

// ---------------------------------------------------------------------------
// Acceptance
// ---------------------------------------------------------------------------

/** Why the planner cannot be accepted yet, in client-facing words. */
export function plannerIssues(p: Planner, quotation: Quotation | null): string[] {
    const out: string[] = [];
    if (!p.title.trim()) out.push("Give the engagement a title.");
    if (p.lines.length === 0) out.push("Add at least one line to the content plan.");
    if (p.lines.some((l) => !l.month)) out.push("Every line needs a month.");
    if (p.lines.some((l) => !l.title.trim())) out.push("Every line needs a title.");
    if (p.lines.some((l) => splitTotal(l.split) !== 100)) out.push("Every line's responsibility split must add up to 100%.");
    if (!quotation) out.push("Link the quotation that carries the investment.");
    if (p.payment.rows.length === 0) out.push("Build the payment schedule.");
    return out;
}

/** One planner line → the task that will sit under the contract. */
export function lineToWork(
    line: PlannerLine,
    p: Pick<Planner, "phases">,
    contract: Pick<Contract, "id" | "clientName" | "accountManager">,
    team: TeamMember[],
    addendumVersion = 0,
): CreateWorkInput {
    return {
        contractId: contract.id,
        clientName: contract.clientName,
        accountManager: contract.accountManager,
        plannerLineId: line.id,
        addendumVersion,
        type: line.type,
        title: line.title,
        channel: line.channel,
        month: line.month,
        phaseKey: line.phaseKey,
        phaseName: phaseName(p, line.phaseKey),
        dueDate: lineDueDate(line),
        split: resolveSplit(line.split, contract, team, line.type),
        approver: line.approver,
        milestone: line.milestone,
        notes: line.note,
    };
}
