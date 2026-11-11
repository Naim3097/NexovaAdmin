import Link from "next/link";
import { getAccessLevel, getActingMember, getCurrentTeamMember, requireTeamAccess } from "@/lib/auth";
import { FUNCTIONS, FUNCTION_LABEL, SYSTEM_ROLES, SYSTEM_ROLE_LABEL, TEAM_ROLES, listTeamMembers } from "@/lib/data/team";
import { listWorks } from "@/lib/data/reads";
import { fmtHours, loadFor, monthlyReserved } from "@/lib/capacity/helpers";
import { functionsOf, hasRole, isManager, rolesOf } from "@/lib/roles";
import { monthLabel, todayKey } from "@/lib/works/helpers";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(sp: SearchParams, key: string): string {
    const v = sp[key];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

/**
 * The team directory: who does what, what they may see, which duties they
 * hold, and how full their month is. Every role can read it (it is where you
 * find a colleague); inviting and changing access is for admins, handing out
 * functions and reserved hours for admins and management.
 */
export default async function TeamPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    await requireTeamAccess();
    const sp = await searchParams;
    const as = one(sp, "as");
    const [members, works, me, linked, access] = await Promise.all([
        listTeamMembers(),
        listWorks(),
        getActingMember(as),
        getCurrentTeamMember(),
        getAccessLevel(),
    ]);
    // Under the bypass "acting as" someone follows their role; a real login
    // keeps the legacy level (bootstrap rule included); nobody picked = admin.
    const admin = me && !linked ? hasRole(me, "admin") : access === "admin";
    const manager = admin || isManager(me);
    const active = members.filter((m) => m.active).length;
    const month = todayKey().slice(0, 7);
    const asQ = linked || !me ? "" : `?as=${encodeURIComponent(me.name)}`;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">Team</h1>
                    <p className="text-sm text-muted-foreground">
                        {active} active · {members.length} total · planned hours for {monthLabel(month)}
                    </p>
                </div>
                <div className="flex items-center gap-4 text-sm font-medium">
                    <Link href={`/profile${asQ}`} className="underline">
                        My profile
                    </Link>
                    <Link href={`/my-work${asQ}`} className="underline">
                        My tasks
                    </Link>
                </div>
            </div>

            {admin ? (
                <InviteForm
                    roles={TEAM_ROLES}
                    systemRoles={SYSTEM_ROLES.map((r) => ({ value: r, label: SYSTEM_ROLE_LABEL[r] }))}
                    functions={FUNCTIONS.map((f) => ({ value: f, label: FUNCTION_LABEL[f] }))}
                />
            ) : (
                <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                    {manager
                        ? "Only admins invite members or change what someone may see; you can hand out duties and set-aside hours on a member's page."
                        : "Only admins invite members or change what someone may see."}{" "}
                    Your own role, hours and contact live on{" "}
                    <Link href={`/profile${asQ}`} className="underline">
                        your profile
                    </Link>
                    .
                </p>
            )}

            <div className="rounded-lg border bg-card">
                <div className="grid border-b p-4 text-sm font-medium md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_minmax(0,1fr)_auto] md:gap-3">
                    <span>Members</span>
                    <span className="hidden text-xs font-normal text-muted-foreground md:block">Access · duties</span>
                    <span className="hidden text-xs font-normal text-muted-foreground md:block">This month · planned / available</span>
                    <span />
                </div>
                {members.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        No members yet.
                    </p>
                ) : (
                    <ul className="divide-y">
                        {members.map((m) => {
                            const load = loadFor(m, works, month);
                            const fill = Math.min(1, load.ratio) * 100;
                            const reserved = monthlyReserved(m);
                            return (
                                <li
                                    key={m.id}
                                    className={cn(
                                        "grid gap-3 p-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-center",
                                        !m.active && "opacity-60",
                                    )}
                                >
                                    <div className="min-w-0">
                                        <Link
                                            href={`/team/${m.id}${asQ}`}
                                            className="font-medium hover:underline"
                                        >
                                            {m.name}
                                        </Link>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {m.role}
                                            {m.email ? ` · ${m.email}` : ""}
                                            {m.skills ? ` · ${m.skills}` : ""}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {rolesOf(m).map((r) => (
                                            <Badge key={r} variant="secondary" className="text-[11px]">
                                                {SYSTEM_ROLE_LABEL[r]}
                                            </Badge>
                                        ))}
                                        {functionsOf(m).map((f) => (
                                            <Badge key={f} variant="outline" className="text-[11px]">
                                                {FUNCTION_LABEL[f]}
                                            </Badge>
                                        ))}
                                    </div>
                                    <div className="min-w-0">
                                        {m.active ? (
                                            <>
                                                <p
                                                    className={cn(
                                                        "text-xs tabular-nums",
                                                        load.overloaded ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground",
                                                    )}
                                                    title={`${fmtHours(load.planned)} planned of ${fmtHours(load.available)} available · ${fmtHours(m.weeklyHours)}/week${reserved > 0 ? ` · ${fmtHours(reserved)} set aside this month` : ""}`}
                                                >
                                                    <span className="font-medium text-foreground">{fmtHours(load.planned)}</span>
                                                    {" / "}
                                                    {fmtHours(load.available)}
                                                    <span className="text-muted-foreground"> · {fmtHours(m.weeklyHours)}/wk</span>
                                                    {reserved > 0 ? (
                                                        <span className="text-muted-foreground/70"> · +{fmtHours(reserved)} set aside</span>
                                                    ) : null}
                                                </p>
                                                <div className="mt-1 h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-muted" role="presentation">
                                                    <div
                                                        className={cn("h-full rounded-full", load.overloaded ? "bg-red-500" : "bg-brand-gradient")}
                                                        style={{ width: `${fill}%` }}
                                                    />
                                                </div>
                                            </>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">inactive · {fmtHours(m.weeklyHours)}/wk</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Link
                                            href={`/works?member=${encodeURIComponent(m.name)}`}
                                            className="text-xs underline text-muted-foreground"
                                        >
                                            Their tasks
                                        </Link>
                                        <Badge variant={m.userId ? "secondary" : "outline"}>
                                            {m.userId ? "has login" : "no login"}
                                        </Badge>
                                        <Badge variant={m.active ? "default" : "outline"}>
                                            {m.active ? "active" : "inactive"}
                                        </Badge>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
