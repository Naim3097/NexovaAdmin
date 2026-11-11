/**
 * Shared bits for the task pages, the contract board, the Website section and
 * the calendar. Server components only.
 */
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { TaskStatus, Work, WorkShare } from "@/lib/data/works";
import type { TeamMember } from "@/lib/data/team";
import { TASK_STATUS_LABEL } from "@/lib/works/helpers";
import { fmtHours, isOffDay } from "@/lib/capacity/helpers";
import {
    APPROVER_LABEL,
    LINE_TYPE_LABEL,
    LINE_TYPE_SHORT,
    SEAT_LABEL,
    SEAT_SHORT,
    type Approver,
    type LineType,
    type Seat,
} from "@/lib/data/planners";
import { cn } from "@/lib/utils";

export const STATUS_CLASS: Record<TaskStatus, string> = {
    not_started: "",
    in_progress: "border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-400",
    pending_approval: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
    completed: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

export const STATUS_DOT: Record<TaskStatus, string> = {
    not_started: "bg-muted-foreground/40",
    in_progress: "bg-blue-500",
    pending_approval: "bg-amber-500",
    completed: "bg-emerald-500",
};

export const TYPE_CLASS: Record<LineType, string> = {
    post: "bg-pink-500/15 text-pink-700 dark:text-pink-400",
    campaign: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
    seo: "bg-teal-500/15 text-teal-700 dark:text-teal-400",
    website: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
    branding: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
    custom: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

export function TaskStatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
    return (
        <Badge variant="outline" className={cn(STATUS_CLASS[status], className)}>
            {TASK_STATUS_LABEL[status]}
        </Badge>
    );
}

export function TypeBadge({ type, short = false }: { type: LineType; short?: boolean }) {
    return (
        <Badge variant="outline" className={cn("border-transparent", TYPE_CLASS[type])} title={LINE_TYPE_LABEL[type]}>
            {short ? LINE_TYPE_SHORT[type] : LINE_TYPE_LABEL[type]}
        </Badge>
    );
}

export function SeatBadge({ seat, short = false }: { seat: Seat; short?: boolean }) {
    return (
        <Badge variant="outline" title={SEAT_LABEL[seat]}>
            {short ? SEAT_SHORT[seat] : SEAT_LABEL[seat]}
        </Badge>
    );
}

/** Who signs the task off: "Sign-off: client" / "Sign-off: AM". Nothing when nobody does. */
export function ApproverBadge({ approver }: { approver: Approver }) {
    if (approver === "none") return null;
    return (
        <Badge
            variant="outline"
            className={approver === "client" ? "border-amber-500/40 text-amber-700 dark:text-amber-400" : ""}
            title={`Sign-off: ${APPROVER_LABEL[approver]}`}
        >
            Sign-off: {approver === "client" ? "client" : "AM"}
        </Badge>
    );
}

/** Owners and their %: "Aisha 50% · Mei 50%" — the role (muted) where nobody owns that part yet. */
export function SplitLabel({ split, short = false, className }: { split: WorkShare[]; short?: boolean; className?: string }) {
    return (
        <span className={cn("text-xs", className)} title="Owners · %">
            {split.map((s, i) => (
                <span key={`${s.seat}-${i}`}>
                    {i > 0 ? <span className="text-muted-foreground"> · </span> : null}
                    <span className={s.member ? "" : "italic text-muted-foreground"}>{s.member || (short ? SEAT_SHORT[s.seat] : SEAT_LABEL[s.seat])}</span>
                    <span className="text-muted-foreground"> {s.pct}%</span>
                </span>
            ))}
        </span>
    );
}

/** "24 Nov" for a YYYY-MM-DD; the input itself when it does not parse. */
function shortDay(ymd: string): string {
    const t = Date.parse(`${ymd}T00:00:00Z`);
    return Number.isNaN(t) ? ymd : new Date(t).toLocaleString("en-MY", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * "due 2026-11-24", "overdue · …", "today · …", plus "moved (was 24 Nov)" when
 * the AM shifted the plan date and "off day" when the date falls on Fri–Sun
 * (the hours still count, and show as off-day work).
 */
export function DueLabel({ due, status, today, adjusted, defaultDue }: { due: string; status: TaskStatus; today: string; adjusted?: boolean; defaultDue?: string }) {
    if (!due) return <span className="text-xs text-muted-foreground">no date</span>;
    const open = status !== "completed";
    const cls =
        open && due < today
            ? "font-medium text-red-600 dark:text-red-400"
            : open && due === today
              ? "font-medium text-amber-700 dark:text-amber-400"
              : "text-muted-foreground";
    return (
        <span className={cn("text-xs tabular-nums", cls)}>
            {open && due < today ? "overdue · " : open && due === today ? "today · " : "due "}
            {due}
            {isOffDay(due) ? (
                <span className="ml-1 rounded bg-muted px-1 text-[10px] font-normal text-muted-foreground" title="Due on a Friday, Saturday or Sunday; counted as off-day work">
                    off day
                </span>
            ) : null}
            {adjusted ? (
                <span
                    className="ml-1 rounded bg-violet-500/15 px-1 text-[10px] text-violet-700 dark:text-violet-400"
                    title={defaultDue ? `Plan date: ${defaultDue}` : "Moved by the account manager"}
                >
                    moved{defaultDue ? ` (was ${shortDay(defaultDue)})` : ""}
                </span>
            ) : null}
        </span>
    );
}

/** Planned working hours as "3h" / "1h 15m"; "—" when none. */
export function HoursLabel({ hours, title, className }: { hours: number; title?: string; className?: string }) {
    return (
        <span className={cn("text-xs tabular-nums", hours > 0 ? "" : "text-muted-foreground", className)} title={title}>
            {hours > 0 ? fmtHours(hours) : "—"}
        </span>
    );
}

/** One task as a board card. */
export function WorkCard({ w, today, showClient = true, href }: { w: Work; today: string; showClient?: boolean; href?: string }) {
    const open = w.status !== "completed";
    const overdue = open && Boolean(w.dueDate) && w.dueDate < today;
    return (
        <li className={cn("rounded-lg border bg-card p-3 text-sm shadow-xs", overdue && "border-red-500/40")}>
            <div className="flex items-start justify-between gap-2">
                <Link href={href ?? `/works/${w.id}`} className="font-medium leading-snug hover:underline">
                    {w.title}
                </Link>
                {w.milestone ? <span title="Milestone" className="text-amber-500">◆</span> : null}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <TypeBadge type={w.type} short />
                {w.channel ? <span className="text-[11px] text-muted-foreground">{w.channel}</span> : null}
                {showClient ? <span className="text-[11px] text-muted-foreground">· {w.clientName}</span> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
                <SplitLabel split={w.split} short />
                <DueLabel due={w.dueDate} status={w.status} today={today} adjusted={Boolean(w.defaultDueDate) && w.dueDate !== w.defaultDueDate} defaultDue={w.defaultDueDate} />
            </div>
            {w.status === "pending_approval" ? (
                <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                    {w.approver === "client" ? `waiting on the client via ${w.accountManager || "AM"}` : `waiting on ${w.accountManager || "the account manager"}`}
                </p>
            ) : null}
        </li>
    );
}

/**
 * "Acting as" picker. With a real login the acting member comes from the
 * session and this never renders; in DEV_AUTH_BYPASS it lets you step through
 * the flow as each person. The chosen name travels as `?as=` and a hidden
 * `as` field on every form.
 */
export function ActingAs({ members, current, linkedMember, makeHref }: { members: TeamMember[]; current: string; linkedMember: string | null; makeHref: (name: string) => string }) {
    if (linkedMember) {
        return (
            <p className="text-xs text-muted-foreground">
                Acting as <span className="font-medium text-foreground">{linkedMember}</span>
            </p>
        );
    }
    return (
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span className="mr-1">Acting as:</span>
            {members.map((m) => (
                <Link
                    key={m.id}
                    href={makeHref(m.name)}
                    className={cn(
                        "rounded-md border px-2 py-0.5",
                        current === m.name ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-accent hover:text-foreground",
                    )}
                >
                    {m.name}
                </Link>
            ))}
        </div>
    );
}

/** Pill-style filter link, as on the content board. */
export function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
    return (
        <Link href={href} className={cn("rounded-full border px-3 py-1 text-xs", active ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
            {children}
        </Link>
    );
}
