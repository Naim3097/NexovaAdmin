/**
 * The one task filter every view shares (project board, calendar, the
 * Deliverables list, the Website section …). Lives in the URL so a filtered
 * board can be shared as a link; "Me" is the one-click chip that narrows a
 * view to the tasks the signed-in person holds a share of (plus the ones
 * waiting for their approval). Pure functions, no I/O.
 */
import type { Work } from "@/lib/data/works";
import { isLineType } from "@/lib/data/planners";
import { isTaskStatus } from "@/lib/data/works";
import { involves } from "@/lib/works/helpers";

/** Pseudo-status for the Status dropdown: every task that is not done. */
export const OPEN_STATUS = "open";

export type WorkFilter = {
    /** Team member name — tasks they hold a share of, or must approve. */
    member: string;
    type: string;
    month: string;
    phase: string;
    /** A TaskStatus, OPEN_STATUS ("open" = not done), or "" for any. */
    status: string;
    client: string;
    am: string;
    /** Only tasks awaiting the member's approval. */
    approval: boolean;
    /** Only overdue tasks. */
    overdue: boolean;
    q: string;
};

export const FILTER_KEYS = ["member", "type", "month", "phase", "status", "client", "am", "approval", "overdue", "q"] as const;

export function parseFilter(sp: Record<string, string | string[] | undefined>): WorkFilter {
    const get = (k: string) => {
        const v = sp[k];
        return (Array.isArray(v) ? v[0] : v) ?? "";
    };
    const type = get("type");
    const status = get("status");
    return {
        member: get("member"),
        type: isLineType(type) ? type : "",
        month: /^\d{4}-\d{2}$/.test(get("month")) ? get("month") : "",
        phase: get("phase"),
        status: isTaskStatus(status) || status === OPEN_STATUS ? status : "",
        client: get("client"),
        am: get("am"),
        approval: get("approval") === "1",
        overdue: get("overdue") === "1",
        q: get("q").trim(),
    };
}

/**
 * Standard users land on their own tasks: when the URL says nothing about
 * `member`, fill it with the viewer. Admins and account managers land on
 * everyone. An explicit `member=` (even empty) always wins.
 */
export function withDefaultMember(f: WorkFilter, sp: Record<string, unknown>, me: string, narrowByDefault: boolean): WorkFilter {
    if (!("member" in sp) && narrowByDefault && me) return { ...f, member: me };
    return f;
}

export function emptyFilter(): WorkFilter {
    return { member: "", type: "", month: "", phase: "", status: "", client: "", am: "", approval: false, overdue: false, q: "" };
}

export function isFiltered(f: WorkFilter): boolean {
    return Boolean(f.member || f.type || f.month || f.phase || f.status || f.client || f.am || f.approval || f.overdue || f.q);
}

export function activeCount(f: WorkFilter): number {
    return [f.member, f.type, f.month, f.phase, f.status, f.client, f.am, f.q].filter(Boolean).length + (f.approval ? 1 : 0) + (f.overdue ? 1 : 0);
}

export function applyFilter(works: Work[], f: WorkFilter, today: string): Work[] {
    const q = f.q.toLowerCase();
    return works.filter((w) => {
        if (f.member && !involves(w, f.member)) return false;
        if (f.approval && !(w.status === "pending_approval" && (!f.member || w.accountManager === f.member))) return false;
        if (f.type && w.type !== f.type) return false;
        if (f.month && w.month !== f.month) return false;
        if (f.phase && w.phaseKey !== f.phase && w.phaseName !== f.phase) return false;
        if (f.status === OPEN_STATUS ? w.status === "completed" : f.status && w.status !== f.status) return false;
        if (f.client && w.clientName !== f.client) return false;
        if (f.am && w.accountManager !== f.am) return false;
        if (f.overdue && !(w.status !== "completed" && w.dueDate && w.dueDate < today)) return false;
        if (q && !`${w.title} ${w.channel} ${w.clientName} ${w.notes}`.toLowerCase().includes(q)) return false;
        return true;
    });
}

/**
 * An open task with a seat nobody holds: a share with a percentage but no
 * person. The "No owner" view on Tasks (`/works?unassigned=1`) and the
 * Dashboard's "no owner" count use the same rule.
 */
export function hasOpenSeat(w: Pick<Work, "status" | "split">): boolean {
    return w.status !== "completed" && w.split.some((s) => s.pct > 0 && !s.member.trim());
}

/** Query string for a filter plus any extra params the page keeps (view, month …). */
export function filterQuery(f: Partial<WorkFilter>, extra: Record<string, string | undefined> = {}): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    if (f.member) q.set("member", f.member);
    if (f.type) q.set("type", f.type);
    if (f.month) q.set("month", f.month);
    if (f.phase) q.set("phase", f.phase);
    if (f.status) q.set("status", f.status);
    if (f.client) q.set("client", f.client);
    if (f.am) q.set("am", f.am);
    if (f.approval) q.set("approval", "1");
    if (f.overdue) q.set("overdue", "1");
    if (f.q) q.set("q", f.q);
    const s = q.toString();
    return s ? `?${s}` : "";
}

/** Human summary of what is applied: "Aisha · posts · November 2026". */
export function filterSummary(f: WorkFilter, labels: { type?: (t: string) => string; month?: (m: string) => string; status?: (s: string) => string }): string {
    const parts = [
        f.member,
        f.approval ? "awaiting my approval" : "",
        f.type ? (labels.type?.(f.type) ?? f.type) : "",
        f.month ? (labels.month?.(f.month) ?? f.month) : "",
        f.phase,
        f.status === OPEN_STATUS ? "open" : f.status ? (labels.status?.(f.status) ?? f.status) : "",
        f.client,
        f.am ? `AM ${f.am}` : "",
        f.overdue ? "overdue" : "",
        f.q ? `"${f.q}"` : "",
    ].filter(Boolean);
    return parts.join(" · ");
}
