import Link from "next/link";
import { getActingMember, getCurrentTeamMember, requireTeamAccess } from "@/lib/auth";
import {
    DEFAULT_HOURS_BY_TYPE,
    DEFAULT_WEEKLY_HOURS,
    FUNCTION_LABEL,
    deliveryWeeklyHours,
    listTeamMembers,
    setAsideWeekly,
} from "@/lib/data/team";
import { LINE_TYPES, LINE_TYPE_LABEL } from "@/lib/data/planners";
import { listWorks } from "@/lib/data/reads";
import { HOUR_STEP, WORK_DAYS, WORK_DAY_LABEL, fmtHours, loadFor, monthlyAvailable, monthlyReserved } from "@/lib/capacity/helpers";
import { workdayHolidayTitle, workingDaysNote } from "@/lib/calendar/days";
import { SYSTEM_ROLE_LABEL, functionsOf, homeFor, isManager, rolesOf } from "@/lib/roles";
import { CATEGORY_LABEL } from "@/lib/team/categories";
import { monthLabel, todayKey } from "@/lib/works/helpers";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActingAs } from "@/app/(admin)/works/ui";
import { DaysOffRows } from "@/app/(admin)/team/days-off-rows";
import { JobFields } from "@/app/(admin)/team/job-fields";
import { SetAsideRows } from "@/app/(admin)/team/set-aside-rows";
import { setDaysOffAction, updateProfileAction } from "@/lib/team/actions";

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
 * Self-service profile: my job role, how to reach me, the hours I have, my
 * non-delivery hours (work that leaves no task behind), and the hours one
 * task of each type takes me. The job category, access (system role), duties
 * and the cost rate are set on the Team page by an admin or manager and shown
 * here read only; admin or management may change their own category here.
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
    // "1" after the How you work form saved, "days-off" after the Days off form did.
    const saved = one(sp, "saved");
    const roles = rolesOf(me);
    const functions = functionsOf(me);
    const availableMonth = monthlyAvailable(me, month);
    const reservedMonth = monthlyReserved(me, month);
    const offThisMonth = me.daysOff[month] ?? 0;
    // Hours one day off takes out of a month: the delivery week spread over the working days.
    const perDay = deliveryWeeklyHours(me) / WORK_DAYS.length;
    // "16 working days (Mon–Thu, 1 public holiday off)": the holidays that fall on a working day are named on hover.
    const daysNote = workingDaysNote(month, load.workingDays);
    const holidayTitle = workdayHolidayTitle(month) || undefined;
    // Only admin or management change a job category; everyone else sees theirs read only.
    const ownCategory = isManager(me);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">{me.name}</h1>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                        <span>
                            {me.role || "No job role yet"}
                            {me.email ? ` · ${me.email}` : ""}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground/80" title="Job category: what tasks you are matched to">
                            {CATEGORY_LABEL[me.category]}
                        </span>
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
                        {monthLabel(month)} · <span title={holidayTitle}>{daysNote}</span>{offThisMonth > 0 ? ` · ${offThisMonth} day${offThisMonth === 1 ? "" : "s"} off` : ""} ·{" "}
                        {fmtHours(deliveryWeeklyHours(me))} of {fmtHours(me.weeklyHours)}/week available
                    </p>
                </div>
                <p className={cn("mt-2 text-lg font-semibold tabular-nums", load.overloaded && "text-red-600 dark:text-red-400")}>
                    {fmtHours(load.planned)} planned{" "}
                    <span className="text-sm font-normal text-muted-foreground">of {fmtHours(availableMonth)} available</span>
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

            {/* Access and duties — read only here */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
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
                    Your access is what you may see; your duties are the pages that open for you. Both are set on the Team page — ask an admin to change them.
                </p>
            </section>

            {/* How I work */}
            <form key={me.updatedAt} action={updateProfileAction} className="space-y-5 rounded-lg border bg-card p-4 md:p-6">
                <input type="hidden" name="as" value={asField} />
                <div>
                    <h2 className="text-sm font-medium">How you work</h2>
                    <p className="text-xs text-muted-foreground">Everyone can see this; only you change it here (management can also set your job and hours on the Team page).</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    <JobFields role={me.role} category={me.category} categoryEditable={ownCategory} self />
                    <div className="space-y-1.5">
                        <Label className="text-sm" htmlFor="phone">
                            Phone
                        </Label>
                        <Input id="phone" name="phone" type="tel" defaultValue={me.phone} placeholder="+60..." />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm" htmlFor="weeklyHours">
                            Hours a week
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
                            {DEFAULT_WEEKLY_HOURS} = four 8-hour days, {WORK_DAY_LABEL}. Fri–Sun and public holidays are off days. About {fmtHours(availableMonth)} available in{" "}
                            {monthName(month)}: {daysNote}, minus the non-delivery hours below.
                        </p>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-sm" htmlFor="skills">
                            Skills (comma-separated)
                        </Label>
                        <Input id="skills" name="skills" defaultValue={me.skills} placeholder="React, Figma, Copywriting" />
                    </div>
                </div>

                <div className="space-y-2">
                    <div>
                        <h3 className="text-sm font-medium">Non-delivery hours a week</h3>
                        <p className="text-xs text-muted-foreground">
                            Hours a week on work that leaves no task behind — management, onboarding, sales… Your delivery hours are {fmtHours(me.weeklyHours)} −{" "}
                            {fmtHours(setAsideWeekly(me))} = {fmtHours(deliveryWeeklyHours(me))}/week.
                        </p>
                    </div>
                    <SetAsideRows rows={me.setAside} idPrefix="profile-aside" />
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
                    {saved === "1" ? (
                        <p role="status" className="text-sm text-green-600">
                            Saved.
                        </p>
                    ) : null}
                    <Button type="submit">Save</Button>
                </div>
            </form>

            {/* Days off — its own form, so a leave entry never resubmits the rest of the profile */}
            <form key={`off-${me.updatedAt}`} action={setDaysOffAction} className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
                <input type="hidden" name="id" value={me.id} />
                <input type="hidden" name="as" value={asField} />
                <input type="hidden" name="return" value="profile" />
                <div>
                    <h2 className="text-sm font-medium">Days off</h2>
                    <p className="text-xs text-muted-foreground tabular-nums">
                        Leave, per month. Each day takes {fmtHours(perDay)} off that month&apos;s available hours
                        {offThisMonth > 0 ? ` — ${offThisMonth} day${offThisMonth === 1 ? "" : "s"} in ${monthName(month)} so far` : ""}. Kuala Lumpur public
                        holidays already come off, so leave them out.
                    </p>
                </div>
                <DaysOffRows daysOff={me.daysOff} startMonth={month} idPrefix="profile-off" />
                <div className="flex items-center justify-end gap-3">
                    {saved === "days-off" ? (
                        <p role="status" className="text-sm text-green-600">
                            Saved.
                        </p>
                    ) : null}
                    <Button type="submit">Save days off</Button>
                </div>
            </form>
        </div>
    );
}
