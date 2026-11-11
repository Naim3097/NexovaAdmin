import Link from "next/link";
import { getAccessLevel, getActingMember, getCurrentTeamMember, requireTeamAccess } from "@/lib/auth";
import { listWorks } from "@/lib/data/works";
import { listContracts } from "@/lib/data/contracts";
import { listInvoices } from "@/lib/data/invoices";
import { listTeamMembers } from "@/lib/data/team";
import { seesFinance, visibleContracts, visibleWorks } from "@/lib/scope";
import { WORK_DAY_LABEL } from "@/lib/capacity/helpers";
import { monthLabel, todayKey } from "@/lib/works/helpers";
import { applyFilter, filterQuery, parseFilter, withDefaultMember } from "@/lib/works/filter";
import { invoiceItems, parseMonth, shiftMonth, taskItems, ymOf } from "@/lib/works/calendar";
import { CalendarGrid } from "./grid";
import { FilterRow } from "../works/filter-bar";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(sp: SearchParams, key: string): string {
    const v = sp[key];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    await requireTeamAccess();
    const sp = await searchParams;
    const [allWorks, allContracts, invoices, team, linked, accessLevel, member] = await Promise.all([
        listWorks(),
        listContracts(),
        listInvoices(),
        listTeamMembers(),
        getCurrentTeamMember(),
        getAccessLevel(),
        getActingMember(one(sp, "as") || undefined),
    ]);
    // A user sees only the tasks they own a part of or must sign off; managers (or nobody picked) see all.
    // Invoice dates show only to those who see money (managers, finance, account managers).
    const works = visibleWorks(member, allWorks);
    const contracts = visibleContracts(member, allContracts, allWorks);
    const withInvoices = seesFinance(member);
    const today = todayKey();
    const { year, month } = parseMonth(one(sp, "m") || undefined);
    const ym = ymOf(year, month);
    // The acting member: the linked login wins; otherwise the `?as=` pick (DEV_AUTH_BYPASS), else the acting-as cookie.
    const as = linked ? "" : one(sp, "as");
    const me = member?.name ?? as;
    const names = team.filter((m) => m.active).map((m) => m.name);
    const ams = [...new Set(contracts.map((c) => c.accountManager).filter(Boolean))].sort();
    const clients = [...new Set(works.map((w) => w.clientName).filter(Boolean))].sort();
    const phases = [...new Set(works.map((w) => w.phaseName).filter(Boolean))].sort();

    // One shared filter: "Me" (my tasks + what waits on me), or any slice of the team's work.
    const filter = withDefaultMember(parseFilter(sp), sp, me, accessLevel === "standard");
    const filtered = applyFilter(works, filter, today);
    const accountScope = Boolean(filter.client || filter.am);

    const items = taskItems(filtered, today, filter.member);
    if (accountScope && withInvoices) {
        const contractIds = new Set(
            contracts
                .filter((c) => (!filter.client || c.clientName === filter.client) && (!filter.am || c.accountManager === filter.am))
                .map((c) => c.id),
        );
        items.push(
            ...invoiceItems(
                invoices.filter((i) => (i.contractId && contractIds.has(i.contractId)) || (filter.client && i.clientName === filter.client)),
                today,
            ),
        );
    }

    const keep: Record<string, string | undefined> = { m: ym, as: as || undefined };
    const monthHref = (m: string) => `/calendar${filterQuery(filter, { ...keep, m })}`;
    const scopeLabel =
        [
            filter.member ? `${filter.member === me ? "my" : `${filter.member}'s`} tasks` : "",
            filter.client ? `client ${filter.client}` : "",
            filter.am ? `${filter.am}'s clients` : "",
        ]
            .filter(Boolean)
            .join(" · ") || "whole team";

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">Calendar</h1>
                    <p className="text-sm text-muted-foreground">
                        {monthLabel(ym)} · {scopeLabel}. Tasks on their due date
                        {filter.member ? " and what they are waiting on" : ""}
                        {accountScope && withInvoices ? ", plus invoice and payment dates" : ""}. Fri–Sun are off days ({WORK_DAY_LABEL} is the working
                        week); tasks due then still show, as off-day work.
                    </p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <Link href={monthHref(shiftMonth(year, month, -1))} className="rounded-md border bg-card px-3 py-1.5 hover:bg-muted">
                        Prev
                    </Link>
                    <Link href={monthHref(today.slice(0, 7))} className="rounded-md border bg-card px-3 py-1.5 hover:bg-muted">
                        Today
                    </Link>
                    <Link href={monthHref(shiftMonth(year, month, +1))} className="rounded-md border bg-card px-3 py-1.5 hover:bg-muted">
                        Next
                    </Link>
                </div>
            </div>

            {/* No Month dropdown here: Prev / Today / Next pick the month shown. */}
            <FilterRow basePath="/calendar" filter={filter} me={me} members={names} months={[]} phases={phases} clients={clients} ams={ams} keep={keep} />

            <CalendarGrid year={year} month={month} items={items} today={today} />
        </div>
    );
}
