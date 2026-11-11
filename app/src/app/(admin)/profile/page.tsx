import Link from "next/link";
import { getActingMember, getCurrentTeamMember, requireTeamAccess } from "@/lib/auth";
import {
    DEFAULT_HOURS_BY_TYPE,
    DEFAULT_WEEKLY_HOURS,
    FUNCTION_LABEL,
    RESERVED_KEYS,
    RESERVED_LABEL,
    TEAM_ROLES,
    deliveryWeeklyHours,
    listTeamMembers,
} from "@/lib/data/team";
import { LINE_TYPES, LINE_TYPE_LABEL } from "@/lib/data/planners";
import { listWorks } from "@/lib/data/reads";
import { HOUR_STEP, WORK_DAY_LABEL, fmtHours, loadFor, monthlyAvailable, monthlyReserved } from "@/lib/capacity/helpers";
import { SYSTEM_ROLE_LABEL, functionsOf, homeFor, rolesOf } from "@/lib/roles";
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
import { ActingAs } from "@/app/(admin)/works/ui";
import { updateProfileAction } from "@/lib/team/actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(sp: SearchParams, key: string): string {
    const v = sp[key];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

/** "November" for a YYYY-MM. */
function monthName(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-MY", { month: "long", timeZone: "UTC" });
}

/**
 * Self-service profile: the job I do, how to reach me, the hours I have and
 * the hours one task of each type takes me. Access (system role), functions,
 * reserved hours and the cost rate are set on the Team page by an admin or
 * manager — shown here read only.
 */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    await requireTeamAccess();
    const sp = await searchParams;
    const as = one(sp, "as");
    const [me, linked, team, works] = await Promise.all([
        getActingMember(as),
        getCurrentTeamMember(),
        listTeamMembers(),
        listWorks(),
    ]);
    const makeHref = (n: string) => `/profile?as=${encodeURIComponent(n)}`;

    if (!me) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">Profile</h1>
                    <p className="text-sm text-muted-foreground">Your job, your hours, and what one task of each type takes you.</p>
                </div>
                <ActingAs members={team.filter((m) => m.active)} current="" linkedMember={null} makeHref={makeHref} />
                <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                    Pick who you are above to open your profile. With a real login this page knows you already.
                </div>
            </div>
        );
    }

    const month = todayKey().slice(0, 7);
    const load = loadFor(me, works, month);
    const fill = Math.min(1, load.ratio) * 100;
    // Forms keep the acting member when there is no real login behind this page.
    const asField = linked ? "" : me.name;
    const saved = one(sp, "saved") === "1";
    const roles = rolesOf(me);
    const functions = functionsOf(me);
    const reserved = RESERVED_KEYS.filter((k) => (me.reservedHours[k] ?? 0) > 0);
    const availableMonth = monthlyAvailable(me, month);
    const reservedMonth = monthlyReserved(me, month);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">{me.name}</h1>
                    <p className="text-sm text-muted-foreground">
                        {me.role}
                        {me.email ? ` · ${me.email}` : ""}
                    </p>
                </div>
                <Link href={homeFor(me)} className="text-sm font-medium underline">
                    Go to my home
                </Link>
            </div>

            {!linked ? <ActingAs members={team.filter((m) => m.active)} current={me.name} linkedMember={null} makeHref={makeHref} /> : null}

            {/* This month */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-sm font-medium">This month</h2>
                    <p className="text-xs text-muted-foreground">
                        {monthLabel(month)} · {load.workingDays} working days ({WORK_DAY_LABEL}) · {fmtHours(deliveryWeeklyHours(me))} of {fmtHours(me.weeklyHours)}/week available
                    </p>
                </div>
                <p className={cn("mt-2 text-lg font-semibold tabular-nums", load.overloaded && "text-red-600 dark:text-red-400")}>
                    {fmtHours(load.planned)} planned{" "}
                    <span className="text-sm font-normal text-muted-foreground">of {fmtHours(availableMonth)} available</span>
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
                    {load.overloaded ? " · over capacity — talk to your account manager about moving a task" : ""}
                    {load.offDay > 0 ? (
                        <span className="text-amber-700 dark:text-amber-400" title="Hours on tasks due on a Friday, Saturday or Sunday — counted in planned">
                            {" "}· {fmtHours(load.offDay)} on off days
                        </span>
                    ) : null}
                    {" · "}
                    <Link href={linked ? "/my-work" : `/my-work?as=${encodeURIComponent(me.name)}`} className="underline">
                        My tasks
                    </Link>
                </p>
            </section>

            {/* Access, duties and set-aside hours — read only here */}
            <section className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-2 md:p-6">
                <div>
                    <h2 className="text-sm font-medium">Access and duties</h2>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {roles.map((r) => (
                            <Badge key={r} variant="secondary">
                                {SYSTEM_ROLE_LABEL[r]}
                            </Badge>
                        ))}
                        {functions.map((f) => (
                            <Badge key={f} variant="outline">
                                {FUNCTION_LABEL[f]}
                            </Badge>
                        ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                        What you can see and the duties on your Home, set by an admin or manager on the Team page.
                    </p>
                </div>
                <div>
                    <h2 className="text-sm font-medium">Set aside per week</h2>
                    {reserved.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">None — every working hour is available for tasks.</p>
                    ) : (
                        <ul className="mt-2 divide-y rounded-md border text-sm">
                            {reserved.map((k) => (
                                <li key={k} className="flex items-center justify-between gap-3 px-3 py-1.5">
                                    <span>{RESERVED_LABEL[k]}</span>
                                    <span className="font-medium tabular-nums">{fmtHours(me.reservedHours[k] ?? 0)}/wk</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                        Hours a hat takes each week, set by your manager; available = hours/week minus these.
                    </p>
                </div>
            </section>

            {/* How I work */}
            <form action={updateProfileAction} className="space-y-5 rounded-lg border bg-card p-4 md:p-6">
                <input type="hidden" name="as" value={asField} />
                <div>
                    <h2 className="text-sm font-medium">How you work</h2>
                    <p className="text-xs text-muted-foreground">Everyone can see this; only you can change it.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Job</Label>
                        <Select name="role" defaultValue={me.role}>
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
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm" htmlFor="phone">
                            Phone
                        </Label>
                        <Input id="phone" name="phone" type="tel" defaultValue={me.phone} placeholder="+60..." />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-sm" htmlFor="skills">
                            Skills (comma-separated)
                        </Label>
                        <Input id="skills" name="skills" defaultValue={me.skills} placeholder="React, Figma, Copywriting" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm" htmlFor="weeklyHours">
                            Hours/week
                        </Label>
                        <Input
                            id="weeklyHours"
                            name="weeklyHours"
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step={HOUR_STEP}
                            defaultValue={me.weeklyHours}
                            placeholder={String(DEFAULT_WEEKLY_HOURS)}
                            className="tabular-nums"
                        />
                        <p className="text-xs text-muted-foreground tabular-nums">
                            {DEFAULT_WEEKLY_HOURS} = four 8-hour days, {WORK_DAY_LABEL}. Fri–Sun are off days. About {fmtHours(availableMonth)} available in{" "}
                            {monthName(month)}: {load.workingDays} working days, minus the hours set aside above.
                        </p>
                    </div>
                </div>

                <div className="space-y-2">
                    <div>
                        <h3 className="text-sm font-medium">Time per task</h3>
                        <p className="text-xs text-muted-foreground">
                            Hours for one task of each type; every task assigned to you starts from here.
                        </p>
                    </div>
                    <div className="divide-y rounded-md border">
                        {LINE_TYPES.map((t) => {
                            const own = me.hoursByType[t];
                            return (
                                <div key={t} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 px-3 py-2">
                                    <div className="min-w-0">
                                        <Label className="text-sm" htmlFor={`hours_${t}`}>
                                            {LINE_TYPE_LABEL[t]}
                                        </Label>
                                        <p className="text-[11px] text-muted-foreground">
                                            {own ? `yours: ${fmtHours(own)}` : `default: ${fmtHours(DEFAULT_HOURS_BY_TYPE[t])}`}
                                        </p>
                                    </div>
                                    <Input
                                        id={`hours_${t}`}
                                        name={`hours_${t}`}
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        step={HOUR_STEP}
                                        defaultValue={own ?? ""}
                                        placeholder={String(DEFAULT_HOURS_BY_TYPE[t])}
                                        className="h-9 tabular-nums"
                                        aria-label={`${LINE_TYPE_LABEL[t]} — hours per task`}
                                    />
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-muted-foreground">Blank = use the default. Quarter hours (0.25) are fine.</p>
                </div>

                <div className="flex items-center justify-end gap-3">
                    {saved ? (
                        <p role="status" className="text-sm text-green-600">
                            Saved.
                        </p>
                    ) : null}
                    <Button type="submit">Save</Button>
                </div>
            </form>
        </div>
    );
}
