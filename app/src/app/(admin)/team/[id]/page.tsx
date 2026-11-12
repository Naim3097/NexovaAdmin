import { notFound } from "next/navigation";
import Link from "next/link";
import { getActingMember, getCurrentTeamMember, requireTeamAccess } from "@/lib/auth";
import {
    DEFAULT_HOURS_BY_TYPE,
    DEFAULT_WEEKLY_HOURS,
    FUNCTIONS,
    FUNCTION_LABEL,
    deliveryWeeklyHours,
    getTeamMemberById,
    setAsideWeekly,
    type TeamFunction,
    type TeamMember,
} from "@/lib/data/team";
import { LINE_TYPES, LINE_TYPE_LABEL } from "@/lib/data/planners";
import { listWorks } from "@/lib/data/reads";
import { HOUR_STEP, WORK_DAYS, WORK_DAY_LABEL, fmtHours, loadFor, monthlyAvailable, monthlyReserved } from "@/lib/capacity/helpers";
import { workdayHolidayTitle, workingDaysNote } from "@/lib/calendar/days";
import { CATEGORY_LABEL } from "@/lib/team/categories";
import { SYSTEM_ROLES, SYSTEM_ROLE_LABEL, functionsOf, isAdmin, isManager, rolesOf, type SystemRole } from "@/lib/roles";
import { monthLabel, todayKey } from "@/lib/works/helpers";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    deleteTeamMemberAction,
    setDaysOffAction,
    setFunctionsAction,
    setJobAction,
    setSetAsideAction,
    setSystemRolesAction,
    updateTeamMemberAction,
} from "@/lib/team/actions";
import { DaysOffRows } from "../days-off-rows";
import { JobFields } from "../job-fields";
import { SetAsideRows } from "../set-aside-rows";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(sp: SearchParams, key: string): string {
    const v = sp[key];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

/** One line per permission set, so the admin knows what a pick grants. */
const ROLE_HINT: Record<SystemRole, string> = {
    admin: "Everything, plus adding members, changing access and deleting records.",
    management: "Everything, including the Dashboard, Finances and the agency profile; hands out duties.",
    user: "Their tasks, calendar, inbox, profile, team and settings, plus the pages their duties open.",
};

/** One line per duty, so the manager knows what a tick adds. */
const FUNCTION_HINT: Record<TeamFunction, string> = {
    delivery: "Every work page: accounts, tasks, content, campaigns, SEO, website, leads, pipeline, onboarding and reports.",
    finance: "Finances: quotes, invoices and reports.",
};

const SET_ASIDE_HELP = "Hours a week on work that leaves no task behind — management, onboarding, sales… Delivery hours = hours/week minus these.";
const DAYS_OFF_HELP = "Leave, per month; each day comes off that month's available hours. Kuala Lumpur public holidays already come off, so leave them out.";

/** "November" for a YYYY-MM. */
function monthName(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-MY", { month: "long", timeZone: "UTC" });
}

/** The member's own hours-per-type table, read only (they edit it on their profile). */
function HoursTable({ member }: { member: TeamMember }) {
    return (
        <div className="divide-y rounded-md border">
            {LINE_TYPES.map((t) => {
                const own = member.hoursByType[t];
                return (
                    <div key={t} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span>{LINE_TYPE_LABEL[t]}</span>
                        <span className={cn("tabular-nums", own ? "font-medium" : "text-muted-foreground")}>
                            {fmtHours(own ?? DEFAULT_HOURS_BY_TYPE[t])}
                            {own ? "" : " · default"}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

/** Role + function chips, read only. */
function AccessChips({ member }: { member: TeamMember }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {rolesOf(member).map((r) => (
                <Badge key={r} variant="secondary">
                    {SYSTEM_ROLE_LABEL[r]}
                </Badge>
            ))}
            {functionsOf(member).map((f) => (
                <Badge key={f} variant="outline">
                    {FUNCTION_LABEL[f]}
                </Badge>
            ))}
        </div>
    );
}

/** The non-delivery hours rows (stored as `setAside`), read only. */
function SetAsideList({ member }: { member: TeamMember }) {
    if (member.setAside.length === 0) return <p className="text-sm text-muted-foreground">No non-delivery hours — every working hour is available for tasks.</p>;
    return (
        <div className="divide-y rounded-md border">
            {member.setAside.map((row, i) => (
                <div key={`${row.label}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span>{row.label}</span>
                    <span className="font-medium tabular-nums">{fmtHours(row.hours)}/wk</span>
                </div>
            ))}
            <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-muted-foreground">
                <span>Total</span>
                <span className="tabular-nums">{fmtHours(setAsideWeekly(member))}/wk</span>
            </div>
        </div>
    );
}

/** The days off per month, read only, soonest first. */
function DaysOffList({ member }: { member: TeamMember }) {
    const rows = Object.entries(member.daysOff).sort(([a], [b]) => a.localeCompare(b));
    if (rows.length === 0) return <p className="text-sm text-muted-foreground">No days off entered.</p>;
    return (
        <div className="divide-y rounded-md border">
            {rows.map(([month, days]) => (
                <div key={month} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span>{monthLabel(month)}</span>
                    <span className="font-medium tabular-nums">
                        {days} day{days === 1 ? "" : "s"}
                    </span>
                </div>
            ))}
        </div>
    );
}

export default async function TeamMemberPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<SearchParams>;
}) {
    await requireTeamAccess();
    const { id } = await params;
    const sp = await searchParams;
    const as = one(sp, "as");
    const [m, me, linked, works] = await Promise.all([
        getTeamMemberById(id),
        getActingMember(as),
        getCurrentTeamMember(),
        listWorks(),
    ]);
    if (!m) notFound();
    // Admins add, change access and delete; admins and management set the job
    // and hand out duties and non-delivery hours. Nobody resolved (dev bypass) counts as admin.
    const admin = isAdmin(me);
    const manager = isManager(me);
    const isSelf = me?.id === m.id;
    const asQ = linked || !me ? "" : `?as=${encodeURIComponent(me.name)}`;
    const month = todayKey().slice(0, 7);
    const load = loadFor(m, works, month);
    const fill = Math.min(1, load.ratio) * 100;
    // Capacity for the month regardless of `active`, for the hours helpers (load.available is 0 for an inactive member).
    const availableMonth = monthlyAvailable(m, month);
    const reservedMonth = monthlyReserved(m, month);
    // "16 working days (Mon–Thu, 1 public holiday off)": the holidays that fall on a working day are named on hover.
    const daysNote = workingDaysNote(month, load.workingDays);
    const holidayTitle = workdayHolidayTitle(month) || undefined;
    const monthNote = `about ${fmtHours(availableMonth)} available in ${monthName(month)}: ${daysNote}`;
    const role = rolesOf(m)[0];
    const offThisMonth = m.daysOff[month] ?? 0;
    // Hours one day off takes out of a month: the delivery week spread over the working days.
    const perDay = deliveryWeeklyHours(m) / WORK_DAYS.length;

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <Link
                        href={`/team${asQ}`}
                        className="text-xs text-muted-foreground hover:underline"
                    >
                        Team
                    </Link>
                    <h1 className="mt-1 text-2xl font-semibold md:text-3xl">
                        {m.name}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {m.role || "No job role yet"}
                        {m.email ? ` · ${m.email}` : ""}
                        {m.active ? "" : " · inactive"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium" title="Job category: what tasks they are matched to">
                            {CATEGORY_LABEL[m.category]}
                        </span>
                        <AccessChips member={m} />
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1 text-sm font-medium">
                    <Link
                        href={`/works?member=${encodeURIComponent(m.name)}`}
                        className="underline"
                    >
                        View their tasks
                    </Link>
                    {isSelf ? (
                        <Link href={`/profile${asQ}`} className="text-xs text-muted-foreground underline">
                            Edit your own hours on your profile
                        </Link>
                    ) : null}
                </div>
            </div>

            {/* This month */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-sm font-medium">This month</h2>
                    <p className="text-xs text-muted-foreground">
                        {monthLabel(month)} · <span title={holidayTitle}>{daysNote}</span>{offThisMonth > 0 ? ` · ${offThisMonth} day${offThisMonth === 1 ? "" : "s"} off` : ""} ·{" "}
                        {fmtHours(deliveryWeeklyHours(m))} of {fmtHours(m.weeklyHours)}/week available
                    </p>
                </div>
                <p className={cn("mt-2 text-lg font-semibold tabular-nums", load.overloaded && "text-red-600 dark:text-red-400")}>
                    {fmtHours(load.planned)} planned{" "}
                    <span className="text-sm font-normal text-muted-foreground">of {fmtHours(load.available)} available</span>
                    {reservedMonth > 0 ? (
                        <span className="text-sm font-normal text-muted-foreground/70"> · +{fmtHours(reservedMonth)} non-delivery hours</span>
                    ) : null}
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted" role="presentation">
                    <div
                        className={cn("h-full rounded-full", load.overloaded ? "bg-red-500" : "bg-brand-gradient")}
                        style={{ width: `${fill}%` }}
                    />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                    {load.tasks} task{load.tasks === 1 ? "" : "s"} · {fmtHours(load.remaining)} still to do
                    {load.overloaded ? " · over capacity" : ""}
                    {load.offDay > 0 ? (
                        <span className="text-amber-700 dark:text-amber-400" title="Hours on tasks due on a Friday, Saturday or Sunday — counted in planned">
                            {" "}· {fmtHours(load.offDay)} on off days
                        </span>
                    ) : null}
                </p>
            </section>

            {manager ? (
                <form
                    key={`job-${m.updatedAt}`}
                    action={setJobAction}
                    className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
                >
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="as" value={as} />
                    <div>
                        <h2 className="text-sm font-medium">Job</h2>
                        <p className="text-xs text-muted-foreground">
                            The job role is the title people read{isSelf ? "" : `; ${m.name} can change it on their profile`}. The job category decides which
                            task seats {isSelf ? "you are" : "they are"} matched to; duties stay as handed out below.
                        </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <JobFields role={m.role} category={m.category} self={isSelf} />
                    </div>
                    <div className="flex justify-end">
                        <Button type="submit">Save job</Button>
                    </div>
                </form>
            ) : null}

            {admin ? (
                <form
                    action={updateTeamMemberAction}
                    className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
                >
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="as" value={as} />
                    <h2 className="text-sm font-medium">Record</h2>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label className="text-sm">Name</Label>
                            <Input name="name" defaultValue={m.name} required />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Email</Label>
                            <Input
                                name="email"
                                type="email"
                                defaultValue={m.email}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Phone</Label>
                            <Input name="phone" type="tel" defaultValue={m.phone} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Hours/week</Label>
                            <Input
                                name="weeklyHours"
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step={HOUR_STEP}
                                defaultValue={m.weeklyHours}
                                className="tabular-nums"
                            />
                            <p className="text-xs text-muted-foreground tabular-nums">
                                {DEFAULT_WEEKLY_HOURS} = four 8-hour days, {WORK_DAY_LABEL}. Fri–Sun and public holidays are off days. After non-delivery hours, {monthNote}.
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Cost rate (MYR / hour)</Label>
                            <Input
                                name="costRateMyr"
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step={0.01}
                                defaultValue={m.costRateMyr || ""}
                                placeholder="not set"
                                className="tabular-nums"
                            />
                            <p className="text-xs text-muted-foreground">Internal. Only admins see this; it prices planned hours.</p>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Skills (comma-separated)</Label>
                        <Input name="skills" defaultValue={m.skills} />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            name="active"
                            defaultChecked={m.active}
                            className="size-4 rounded border-input"
                        />
                        Active
                    </label>
                    <div className="flex justify-end">
                        <Button type="submit">Save</Button>
                    </div>
                </form>
            ) : null}

            {admin ? (
                <form
                    action={setSystemRolesAction}
                    className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
                >
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="as" value={as} />
                    <div>
                        <h2 className="text-sm font-medium">Access</h2>
                        <p className="text-xs text-muted-foreground">
                            What this login may see; one per person.
                        </p>
                    </div>
                    <ul className="grid gap-2 md:grid-cols-3">
                        {SYSTEM_ROLES.map((r) => (
                            <li key={r}>
                                <label className="flex h-full cursor-pointer items-start gap-2.5 rounded-md border p-3 text-sm hover:bg-accent/50">
                                    <input
                                        type="radio"
                                        name="systemRole"
                                        value={r}
                                        defaultChecked={role === r}
                                        className="mt-0.5 size-4 border-input"
                                    />
                                    <span className="min-w-0">
                                        <span className="font-medium">{SYSTEM_ROLE_LABEL[r]}</span>
                                        <span className="block text-xs text-muted-foreground">{ROLE_HINT[r]}</span>
                                    </span>
                                </label>
                            </li>
                        ))}
                    </ul>
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">The last active admin keeps the admin role.</p>
                        <Button type="submit">Save access</Button>
                    </div>
                </form>
            ) : null}

            {manager ? (
                <>
                    <form
                        action={setFunctionsAction}
                        className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
                    >
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="as" value={as} />
                        <div>
                            <h2 className="text-sm font-medium">Duties</h2>
                            <p className="text-xs text-muted-foreground">
                                Each duty opens pages for {m.name}, never more access. Being an account manager follows from the accounts they are set on.
                            </p>
                        </div>
                        <ul className="grid gap-2 md:grid-cols-2">
                            {FUNCTIONS.map((f) => (
                                <li key={f}>
                                    <label className="flex h-full cursor-pointer items-start gap-2.5 rounded-md border p-3 text-sm hover:bg-accent/50">
                                        <input
                                            type="checkbox"
                                            name="functions"
                                            value={f}
                                            defaultChecked={m.functions.includes(f)}
                                            className="mt-0.5 size-4 rounded border-input"
                                        />
                                        <span className="min-w-0">
                                            <span className="font-medium">{FUNCTION_LABEL[f]}</span>
                                            <span className="block text-xs text-muted-foreground">{FUNCTION_HINT[f]}</span>
                                        </span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                        <div className="flex justify-end">
                            <Button type="submit">Save duties</Button>
                        </div>
                    </form>

                    <form
                        key={m.updatedAt}
                        action={setSetAsideAction}
                        className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
                    >
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="as" value={as} />
                        <div>
                            <h2 className="text-sm font-medium">Non-delivery hours a week</h2>
                            <p className="text-xs text-muted-foreground">{SET_ASIDE_HELP} {m.name} can edit these rows on their profile too.</p>
                        </div>
                        <SetAsideRows rows={m.setAside} />
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-muted-foreground tabular-nums">
                                {fmtHours(m.weeklyHours)}/week − {fmtHours(setAsideWeekly(m))} non-delivery = {fmtHours(deliveryWeeklyHours(m))}/week
                                available over {WORK_DAY_LABEL} ({monthNote}).
                            </p>
                            <Button type="submit">Save hours</Button>
                        </div>
                    </form>

                    <form
                        key={`off-${m.updatedAt}`}
                        action={setDaysOffAction}
                        className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
                    >
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="as" value={as} />
                        <div>
                            <h2 className="text-sm font-medium">Days off</h2>
                            <p className="text-xs text-muted-foreground">{DAYS_OFF_HELP} {m.name} can enter these on their profile too.</p>
                        </div>
                        <DaysOffRows daysOff={m.daysOff} startMonth={month} />
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-muted-foreground tabular-nums">
                                One day off = {fmtHours(perDay)} less that month ({fmtHours(deliveryWeeklyHours(m))}/week over {WORK_DAY_LABEL}).
                            </p>
                            <Button type="submit">Save days off</Button>
                        </div>
                    </form>
                </>
            ) : (
                <section className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
                    <div>
                        <h2 className="text-sm font-medium">Access and duties</h2>
                        <div className="mt-2">
                            <AccessChips member={m} />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                            {m.skills ? `Skills: ${m.skills}. ` : ""}
                            {m.phone ? `Phone: ${m.phone}. ` : ""}
                            Only admins change access or contact details; admins and management set the job and hand out duties.
                        </p>
                    </div>
                    <div>
                        <h3 className="text-sm font-medium">Non-delivery hours a week</h3>
                        <p className="mb-2 text-xs text-muted-foreground">{SET_ASIDE_HELP}</p>
                        <SetAsideList member={m} />
                    </div>
                    <div>
                        <h3 className="text-sm font-medium">Days off</h3>
                        <p className="mb-2 text-xs text-muted-foreground">{DAYS_OFF_HELP}</p>
                        <DaysOffList member={m} />
                    </div>
                </section>
            )}

            <section className="space-y-2 rounded-lg border bg-card p-4 md:p-6">
                <div>
                    <h2 className="text-sm font-medium">Time per task</h2>
                    <p className="text-xs text-muted-foreground">
                        What one task of each type takes {m.name}, set on their profile.
                    </p>
                </div>
                <HoursTable member={m} />
            </section>

            {admin ? (
                <form
                    action={deleteTeamMemberAction}
                    className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"
                >
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="as" value={as} />
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-destructive">
                                Delete member
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Removes the record; their tasks keep the name.
                            </p>
                        </div>
                        <Button type="submit" variant="destructive">
                            Delete
                        </Button>
                    </div>
                </form>
            ) : null}
        </div>
    );
}
