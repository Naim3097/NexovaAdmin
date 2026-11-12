/**
 * My accounts — the account manager's home. The projects they manage
 * (`myContracts`) and those projects' clients only: what is waiting on them
 * (approvals, oldest first), each project's health with the one next move,
 * a pending account-manager transfer, and who carries their clients' work
 * this month.
 *
 * Who "I" am: the linked login, else the `?as=` pick (DEV_AUTH_BYPASS), else
 * the acting-as cookie. Only when nobody is picked (dev bypass) does the page
 * show every active project, with a note. Tasks I hold on other people's
 * projects are on My tasks, not here.
 */
import Link from "next/link";
import { getActingMember, getCurrentTeamMember, requireTeamAccess } from "@/lib/auth";
import { listContracts } from "@/lib/data/contracts";
import { listInvoices } from "@/lib/data/invoices";
import { listTeamMembers } from "@/lib/data/team";
import { listWorks } from "@/lib/data/works";
import { findMember, hoursByMonthAndMember } from "@/lib/capacity/helpers";
import { myContracts } from "@/lib/scope";
import { filterQuery } from "@/lib/works/filter";
import { todayKey } from "@/lib/works/helpers";
import { ActingAs } from "@/app/(admin)/works/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ApprovalsQueue } from "./approvals-queue";
import { ContractCard } from "./contract-card";
import { MonthLoad, type LoadRow } from "./month-load";
import { deriveCard, sortByRisk, sortPending, totalsOf } from "./derive";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function one(sp: SP, key: string): string {
    const v = sp[key];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

export default async function MyClientsPage({ searchParams }: { searchParams: Promise<SP> }) {
    await requireTeamAccess();
    const sp = await searchParams;
    const preferred = one(sp, "as");
    const [contracts, works, invoices, team, linked, member] = await Promise.all([
        listContracts(),
        listWorks(),
        listInvoices(),
        listTeamMembers(),
        getCurrentTeamMember(),
        getActingMember(preferred || undefined),
    ]);
    const today = todayKey();
    const thisMonth = today.slice(0, 7);
    const activeTeam = team.filter((m) => m.active);
    const me = member?.name ?? "";
    // Forms and links carry `as` only under the dev bypass (a real login resolves itself).
    const asParam = member && !linked ? member.name : undefined;
    const asField = asParam ? <input type="hidden" name="as" value={asParam} /> : null;
    const asQ = asParam ? `?as=${encodeURIComponent(asParam)}` : "";

    // ---- Mine: the live projects I am the account manager of, and nothing else. Only when
    // nobody is picked (dev bypass) does the page fall back to every active project.
    const fallback = !member;
    const mine = myContracts(member, contracts).filter((c) => (fallback ? c.status === "active" : c.status === "active" || c.status === "draft"));
    const byId = new Map(mine.map((c) => [c.id, c]));

    const cards = sortByRisk(mine.map((c) => deriveCard(c, works, invoices, today, asParam)));
    /** My projects with a handover pending: the role is leaving once the colleague accepts. */
    const handingOver = mine.flatMap((c) => (c.handover ? [{ c, h: c.handover }] : []));
    // The tasks on my projects — the only tasks this page counts.
    const myWorks = cards.flatMap((k) => k.works);
    const totals = totalsOf(cards, invoices, today);
    const pending = sortPending(myWorks.filter((w) => w.status === "pending_approval"));

    // ---- This month by person: planned hours on my projects.
    const hours = hoursByMonthAndMember(myWorks).get(thisMonth) ?? new Map<string, number>();
    const loadRows: LoadRow[] = [...hours.entries()]
        .map(([name, h]) => {
            const known = Boolean(findMember(team, name));
            return {
                name,
                hours: h,
                tasks: known ? myWorks.filter((w) => w.month === thisMonth && w.split.some((s) => s.member === name)).length : 0,
                unassigned: !known,
                href: known ? `/works${filterQuery({ member: name, month: thisMonth, am: fallback ? "" : me }, { as: asParam })}` : "",
            };
        })
        .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));

    const kpis = [
        { label: "Accounts", value: String(totals.contracts), hint: fallback ? "every active account" : "active + draft", href: "#contracts", tone: "neutral" },
        {
            label: "Tasks this month",
            value: `${totals.month.done}/${totals.month.total}`,
            hint: totals.month.total ? `${totals.month.pct}% done` : "none planned",
            href: `/works${filterQuery({ month: thisMonth, am: fallback ? "" : me }, { as: asParam })}`,
            tone: "neutral",
        },
        {
            label: "Overdue",
            value: String(totals.overdue),
            hint: "open tasks past due",
            href: `/works${filterQuery({ overdue: true, am: fallback ? "" : me }, { as: asParam })}`,
            tone: totals.overdue > 0 ? "bad" : "good",
        },
        {
            label: "In review",
            value: String(totals.awaiting),
            hint: pending.length ? `oldest ${pending[0].submittedAt ? pending[0].submittedAt.slice(0, 10) : "—"}` : "queue is clear",
            href: "#approvals",
            tone: totals.awaiting > 0 ? "warn" : "good",
        },
        {
            label: "Invoices overdue",
            value: String(totals.invoicesOverdue),
            hint: "sent and past due",
            href: "/invoices",
            tone: totals.invoicesOverdue > 0 ? "bad" : "good",
        },
    ] as const;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">My accounts{me ? ` · ${me}` : ""}</h1>
                    <p className="text-sm text-muted-foreground">
                        {fallback
                            ? "Pick who you are to see your own accounts — showing every active account."
                            : "The accounts you manage: what waits on you, where each one stands, and the one next move."}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
                    {me ? (
                        <Link href={`/my-work${asQ}`} className="underline">
                            My tasks
                        </Link>
                    ) : null}
                    <Link href={`/projects${asQ}`} className="underline">
                        All accounts
                    </Link>
                </div>
            </div>

            <ActingAs members={activeTeam} current={me} linkedMember={linked?.name ?? null} makeHref={(n) => `/my-clients?as=${encodeURIComponent(n)}`} />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {kpis.map((k) => (
                    <Link key={k.label} href={k.href} className="block">
                        <Card className="h-full transition-all hover:shadow-md hover:ring-primary/20">
                            <CardHeader className="pb-1">
                                <CardTitle className="text-xs font-medium text-muted-foreground">{k.label}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div
                                    className={cn(
                                        "text-2xl font-semibold tabular-nums",
                                        k.tone === "bad" && "text-red-600 dark:text-red-400",
                                        k.tone === "warn" && "text-amber-700 dark:text-amber-400",
                                        k.tone === "good" && "text-emerald-700 dark:text-emerald-400",
                                    )}
                                >
                                    {k.value}
                                </div>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">{k.hint}</p>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>

            <ApprovalsQueue list={pending} contracts={byId} today={today} asQ={asQ} asField={asField} />

            <section id="contracts" className="scroll-mt-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-medium">
                        Accounts <span className="tabular-nums text-muted-foreground">· {cards.length}</span>
                    </h2>
                    <p className="text-xs text-muted-foreground">Most at risk first: overdue, then stale approvals, then the nearest due date.</p>
                </div>
                {handingOver.length > 0 ? (
                    <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                        Transfer pending:{" "}
                        {handingOver.map(({ c, h }, i) => (
                            <span key={c.id}>
                                {i > 0 ? " · " : ""}
                                <Link href={`/projects/${c.id}${filterQuery({}, { tab: "setup", as: asParam })}#account-manager`} className="underline">
                                    {c.name}
                                </Link>{" "}
                                → {h.to} since <span className="tabular-nums">{h.at.slice(0, 10)}</span>
                            </span>
                        ))}
                        . Nothing moves until they accept; withdraw on the account&apos;s Setup tab.
                    </p>
                ) : null}
                {cards.length === 0 ? (
                    <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                        {fallback ? (
                            <>
                                No active account on the books.{" "}
                                <Link href="/projects/new" className="underline">
                                    Create one
                                </Link>{" "}
                                or accept a quote.
                            </>
                        ) : (
                            <>
                                You are not the account manager of any live account. Your own tasks are on{" "}
                                <Link href={`/my-work${asQ}`} className="underline">
                                    My tasks
                                </Link>
                                .
                            </>
                        )}
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {cards.map((k) => (
                            <ContractCard key={k.c.id} card={k} today={today} asQ={asQ} />
                        ))}
                    </ul>
                )}
            </section>

            <MonthLoad month={thisMonth} rows={loadRows} />
        </div>
    );
}
