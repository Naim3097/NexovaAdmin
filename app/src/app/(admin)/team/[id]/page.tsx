import { notFound } from "next/navigation";
import Link from "next/link";
import { getAccessLevel, getActingMember, getCurrentTeamMember, requireTeamAccess } from "@/lib/auth";
import {
    DEFAULT_HOURS_BY_TYPE,
    DEFAULT_WEEKLY_HOURS,
    FUNCTIONS,
    FUNCTION_LABEL,
    RESERVED_KEYS,
    RESERVED_LABEL,
    TEAM_ROLES,
    deliveryWeeklyHours,
    getTeamMemberById,
    type TeamFunction,
    type TeamMember,
} from "@/lib/data/team";
import { LINE_TYPES, LINE_TYPE_LABEL } from "@/lib/data/planners";
import { listWorks } from "@/lib/data/reads";
import { HOUR_STEP, WORK_DAY_LABEL, fmtHours, loadFor, monthlyAvailable, monthlyReserved } from "@/lib/capacity/helpers";
import { SYSTEM_ROLES, SYSTEM_ROLE_LABEL, functionsOf, hasRole, isManager, rolesOf, type SystemRole } from "@/lib/roles";
import { monthLabel, todayKey } from "@/lib/works/helpers";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    deleteTeamMemberAction,
    setFunctionsAction,
    setReservedHoursAction,
    setSystemRolesAction,
    updateTeamMemberAction,
} from "@/lib/team/actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(sp: SearchParams, key: string): string {
    const v = sp[key];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

/** One line per permission set, so the admin knows what a pick grants. */
const ROLE_HINT: Record<SystemRole, string> = {
    admin: "Everything, including settings, finances, access and this page.",
    management: "Everything; hands out duties and set-aside hours.",
    user: "Only what is assigned to them: their tasks, their contracts, plus what their duties unlock.",
};

/** One line per duty, so the manager knows what a tick adds. */
const FUNCTION_HINT: Record<TeamFunction, string> = {
    account_manager: "My accounts, onboarding, approvals, reports and invoices for their contracts.",
    sales: "Pipeline, leads and quotes.",
    finance: "Finance, invoices, quotes and reports.",
};

const RESERVED_HELP = "Hours this person spends on this hat each week; available = hours/week minus these.";

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

/** Reserved hours per hat, read only. */
function ReservedList({ member }: { member: TeamMember }) {
    const entries = RESERVED_KEYS.filter((k) => (member.reservedHours[k] ?? 0) > 0);
    if (entries.length === 0) return <p className="text-sm text-muted-foreground">No hours set aside — every working hour is available for tasks.</p>;
    return (
        <div className="divide-y rounded-md border">
            {entries.map((k) => (
                <div key={k} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span>{RESERVED_LABEL[k]}</span>
                    <span className="font-medium tabular-nums">{fmtHours(member.reservedHours[k] ?? 0)}/wk</span>
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
    const [m, me, linked, access, works] = await Promise.all([
        getTeamMemberById(id),
        getActingMember(as),
        getCurrentTeamMember(),
        getAccessLevel(),
        listWorks(),
    ]);
    if (!m) notFound();
    // Under the bypass "acting as" someone follows their role; a real login
    // keeps the legacy level (bootstrap rule included); nobody picked = admin.
    const admin = me && !linked ? hasRole(me, "admin") : access === "admin";
    const manager = admin || isManager(me);
    const isSelf = me?.id === m.id;
    const asQ = linked || !me ? "" : `?as=${encodeURIComponent(me.name)}`;
    const month = todayKey().slice(0, 7);
    const load = loadFor(m, works, month);
    const fill = Math.min(1, load.ratio) * 100;
    // Capacity for the month regardless of `active`, for the hours helpers (load.available is 0 for an inactive member).
    const availableMonth = monthlyAvailable(m, month);
    const reservedMonth = monthlyReserved(m, month);
    const monthNote = `about ${fmtHours(availableMonth)} available in ${monthName(month)}: ${load.workingDays} working days`;
    const role = rolesOf(m)[0];

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
                        {m.role}
                        {m.email ? ` · ${m.email}` : ""}
                        {m.active ? "" : " · inactive"}
                    </p>
                    <div className="mt-2">
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
                        {monthLabel(month)} · {load.workingDays} working days ({WORK_DAY_LABEL}) · {fmtHours(deliveryWeeklyHours(m))} of {fmtHours(m.weeklyHours)}/week available
                    </p>
                </div>
                <p className={cn("mt-2 text-lg font-semibold tabular-nums", load.overloaded && "text-red-600 dark:text-red-400")}>
                    {fmtHours(load.planned)} planned{" "}
                    <span className="text-sm font-normal text-muted-foreground">of {fmtHours(load.available)} available</span>
                    {reservedMonth > 0 ? (
                        <span className="text-sm font-normal text-muted-foreground/70"> · +{fmtHours(reservedMonth)} set aside</span>
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
                            <Label className="text-sm">Job</Label>
                            <Select name="role" defaultValue={m.role}>
                                <SelectTrigger className="h-10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TEAM_ROLES.map((r) => (
                                        <SelectItem key={r} value={r}>
                                            {r}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">The job they do. They can change this on their profile.</p>
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
                                {DEFAULT_WEEKLY_HOURS} = four 8-hour days, {WORK_DAY_LABEL}. Fri–Sun are off days. After set-aside hours, {monthNote}.
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
                                Each duty adds pages and work for {m.name}, never more access.
                            </p>
                        </div>
                        <ul className="grid gap-2 md:grid-cols-3">
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
                        action={setReservedHoursAction}
                        className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
                    >
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="as" value={as} />
                        <div>
                            <h2 className="text-sm font-medium">Set aside per week</h2>
                            <p className="text-xs text-muted-foreground">{RESERVED_HELP}</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                            {RESERVED_KEYS.map((k) => (
                                <div key={k} className="space-y-1.5">
                                    <Label className="text-sm" htmlFor={`reserved_${k}`}>
                                        {RESERVED_LABEL[k]}
                                    </Label>
                                    <Input
                                        id={`reserved_${k}`}
                                        name={`reserved_${k}`}
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        step={HOUR_STEP}
                                        defaultValue={m.reservedHours[k] ?? ""}
                                        placeholder="0"
                                        className="tabular-nums"
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-muted-foreground tabular-nums">
                                {fmtHours(m.weeklyHours)}/week − {fmtHours(m.weeklyHours - deliveryWeeklyHours(m))} set aside = {fmtHours(deliveryWeeklyHours(m))}/week
                                available over {WORK_DAY_LABEL} ({monthNote}). Blank = 0.
                            </p>
                            <Button type="submit">Save hours</Button>
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
                            Only admins change access or contact details; admins and management hand out duties.
                        </p>
                    </div>
                    <div>
                        <h3 className="text-sm font-medium">Set aside per week</h3>
                        <p className="mb-2 text-xs text-muted-foreground">{RESERVED_HELP}</p>
                        <ReservedList member={m} />
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
