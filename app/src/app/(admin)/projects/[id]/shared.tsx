/**
 * Project page — the view model the header and every tab share, derived once
 * in page.tsx from the fetched data and the URL. Server only, no I/O.
 *
 * Everything the page knows lives in the URL: the tab, the Tasks view state
 * (view / group / wm / cm), the task filter and the dev-only `as` pick. The
 * `href` / `tabHref` helpers carry all of it from link to link.
 */
import type { getAccessLevel, getActingMember, getCurrentTeamMember } from "@/lib/auth";
import { CONTRACT_STAGES, isSigned, type Contract } from "@/lib/data/contracts";
import type { Client } from "@/lib/data/clients";
import type { Invoice } from "@/lib/data/invoices";
import type { Quotation } from "@/lib/data/quotations";
import type { TeamMember } from "@/lib/data/team";
import type { Work } from "@/lib/data/works";
import { NO_PHASE, isOverdue, monthsOf, nextDue, nextMonth, phasesOf, progress, todayKey } from "@/lib/works/helpers";
import { actorOf } from "@/lib/works/actor";
import { applyFilter, filterQuery, parseFilter, withDefaultMember, type WorkFilter } from "@/lib/works/filter";
import { invoiceItems, parseMonth, taskItems, ymOf } from "@/lib/works/calendar";
import { WORK_DAYS, findMember } from "@/lib/capacity/helpers";
import { deliveryWeeklyHours } from "@/lib/data/team";
import { phaseForMonth } from "@/lib/planners/helpers";
import { contractMonths, isGenerated, monthsToGenerate } from "@/lib/contracts/generate";
import { endedDaysAgo, endsInDays, invoicesFor, setupChecklist } from "@/lib/contracts/helpers";

export type SP = Record<string, string | string[] | undefined>;
export type View = "board" | "calendar" | "list";
/** How the Tasks section is sliced: by month (default) or by project phase. */
export type Group = "month" | "phase";

/** The `tab` URL values stay as they are; only the labels read differently. The Contract tab (`money`) is hidden on an internal project. */
export type Tab = "work" | "client" | "plan" | "money" | "setup" | "history";
export const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
    { key: "work", label: "Tasks" },
    { key: "client", label: "Client" },
    { key: "plan", label: "Plan" },
    { key: "money", label: "Contract" },
    { key: "setup", label: "Details" },
    { key: "history", label: "Activity" },
];
export function isTab(v: string): v is Tab {
    return TABS.some((t) => t.key === v);
}

export const LBL = "block text-xs text-muted-foreground";
export const INP_SM = "h-8 px-2 text-xs md:text-xs";
export const SEL = "h-9 w-full rounded-md border bg-background px-2 text-sm";
export const CARD = "rounded-lg border bg-card p-4 md:p-6";

/** "Nov 2026" for a YYYY-MM. */
export function shortMonth(ym: string): string {
    if (!/^\d{4}-\d{2}$/.test(ym)) return ym || "—";
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-MY", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Overdue first, then by due date, then title. */
export function sortTasks(list: Work[], today: string): Work[] {
    return [...list].sort((a, b) => {
        const ao = isOverdue(a, today);
        const bo = isOverdue(b, today);
        if (ao !== bo) return ao ? -1 : 1;
        return (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.title.localeCompare(b.title);
    });
}

/**
 * The next month "Add next month" would generate: the first month of the term
 * without generated tasks; on an open-ended project, the month after the last
 * generated one once the initial months are in. Null when the term is full.
 */
export function nextMonthToGenerate(c: Pick<Contract, "startDate" | "endDate">, cWorks: Work[]): string | null {
    const pending = monthsToGenerate(c, cWorks);
    if (pending.length > 0) return pending[0];
    if (c.endDate) return null;
    const generated = cWorks.filter(isGenerated).map((w) => w.month).sort();
    const last = generated[generated.length - 1];
    return last ? nextMonth(last) : (contractMonths(c)[0] ?? null);
}

export type ViewInput = {
    c: Contract;
    contracts: Contract[];
    clients: Client[];
    team: TeamMember[];
    invoices: Invoice[];
    quotations: Quotation[];
    allWorks: Work[];
    linked: Awaited<ReturnType<typeof getCurrentTeamMember>>;
    member: Awaited<ReturnType<typeof getActingMember>>;
    access: Awaited<ReturnType<typeof getAccessLevel>>;
    sp: SP;
};

export function deriveView({ c, contracts, clients, team, invoices, quotations, allWorks, linked, member, access, sp }: ViewInput) {
    const one = (k: string) => {
        const v = sp[k];
        return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
    };

    const today = todayKey();
    const thisMonth = today.slice(0, 7);
    const activeTeam = team.filter((m) => m.active);
    const memberNames = activeTeam.map((m) => m.name);
    const client = clients.find((x) => x.name === c.clientName);
    /** The client's other projects, newest first. */
    const clientContracts = contracts.filter((x) => x.clientName === c.clientName && x.id !== c.id);
    const quotation = quotations.find((q) => q.id === c.quotationId) ?? null;
    const tabRaw = one("tab");
    const tab: Tab = isTab(tabRaw) ? tabRaw : "work";
    /** `?error=` from a rejected add on the Plan tab (`deliverable`, `phase`). */
    const error = one("error");

    // Who is acting: the linked member, else the `?as=` pick (DEV_AUTH_BYPASS).
    const actor = linked?.name ?? member?.name ?? one("as");
    const asParam = actor && !linked ? actor : undefined;
    const asField = asParam ? <input type="hidden" name="as" value={asParam} /> : null;
    const asQ = asParam ? `?as=${encodeURIComponent(asParam)}` : "";

    // ---- Phases: the project's own.
    const cWorks = allWorks.filter((w) => w.contractId === c.id);
    const phases = c.phases;
    const currentPhase = phaseForMonth({ phases }, thisMonth);
    const phaseWorks = (key: string, name: string) => cWorks.filter((w) => w.phaseKey === key || (!w.phaseKey && w.phaseName === name));
    const phaseNames = phases.map((ph) => ph.name);
    /** Phase names on tasks that are not (any longer) a project phase. */
    const strayPhaseNames = phasesOf(cWorks, phaseNames).filter((n) => n !== NO_PHASE && !phaseNames.includes(n));
    const hasUnphased = cWorks.some((w) => !w.phaseName);
    /** Admins and the project's account manager edit the plan (add deliverables and phases, edit phases, add months). */
    const canEdit = access === "admin" || (Boolean(actor) && actor === c.accountManager);
    const canEditPhases = canEdit;

    // ---- Account-manager transfer ("handover" in the data; the actions in src/lib/contracts/actions.ts compare names the same way)
    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
    const handover = c.handover;
    /** The acting member is the project's account manager — the only one who may hand it over. */
    const isAccountManager = Boolean(actor) && Boolean(c.accountManager) && same(actor, c.accountManager);
    /** The acting member is the colleague a pending handover names; only they can accept or decline. */
    const isHandoverTarget = Boolean(handover && actor && same(actor, handover.to));

    // ---- Requirements, crew, generation
    const requirements = c.requirements;
    const crew = c.crew;
    const generatedMonths = [...new Set(cWorks.filter(isGenerated).map((w) => w.month))].sort();
    const nextGenMonth = nextMonthToGenerate(c, cWorks);

    // ---- Tasks: filter + view state (all in the URL)
    const narrow = access === "standard" && Boolean(actor) && actor !== c.accountManager;
    const filter = withDefaultMember(parseFilter(sp), sp, actor, narrow);
    const viewRaw = one("view");
    const view: View = viewRaw === "calendar" || viewRaw === "list" ? viewRaw : "board";
    const group: Group = one("group") === "phase" ? "phase" : "month";
    const months = monthsOf(cWorks);
    const wmRaw = one("wm");
    // The Month dropdown only scopes the month view; in phase mode the phase filter does the slicing.
    const wm = group === "month" && months.includes(wmRaw) ? wmRaw : "all";
    const { year: calYear, month: calMonth } = parseMonth(one("cm") || undefined);
    const calYm = ymOf(calYear, calMonth);
    const keep: Record<string, string | undefined> = {
        tab: tab === "work" ? undefined : tab,
        view: view === "board" ? undefined : view,
        group: group === "phase" ? "phase" : undefined,
        wm: wm === "all" ? undefined : wm,
        cm: view === "calendar" ? calYm : undefined,
        as: asParam,
    };
    const base = `/projects/${c.id}`;
    /** A link into the Tasks section: keeps the tab, the view state and the filter, lands on #works. */
    const href = (extra: Record<string, string | undefined> = {}, f: WorkFilter = filter) => `${base}${filterQuery(f, { ...keep, ...extra })}#works`;
    /** A link to a tab, keeping the view state and the filter. */
    const tabHref = (t: Tab, extra: Record<string, string | undefined> = {}, anchor = "") =>
        `${base}${filterQuery(filter, { ...keep, ...extra, tab: t === "work" ? undefined : t })}${anchor}`;
    /** The Tasks board with this client picked: where extra tasks are added (its To do "+"). */
    const boardHref = `/works${filterQuery({ client: c.clientName }, { view: "board", as: asParam })}`;
    /** The same board with the add dialog open on this project (the header's "Add task"). */
    const newTaskHref = `/works${filterQuery({ client: c.clientName }, { view: "board", new: c.id, as: asParam })}`;
    /** Jump to the Tasks tab grouped by phase with this phase selected (a key, a stray name, or NO_PHASE). */
    const phaseHref = (phase: string) => href({ tab: undefined, group: "phase", wm: undefined }, { ...filter, phase });

    // `phase=No phase` is the option for unphased tasks; the shared filter cannot express it.
    const noPhase = filter.phase === NO_PHASE;
    const matched = applyFilter(cWorks, noPhase ? { ...filter, phase: "" } : filter, today);
    const filtered = noPhase ? matched.filter((w) => !w.phaseName) : matched;
    const selectedPhase = group === "phase" ? phases.find((ph) => ph.key === filter.phase || ph.name === filter.phase) : undefined;
    const scoped = wm === "all" ? filtered : filtered.filter((w) => w.month === wm);
    const p = progress(cWorks);
    const overdueCount = cWorks.filter((w) => isOverdue(w, today)).length;
    const next = nextDue(cWorks);
    const calItems = [...taskItems(filtered, today, filter.member), ...invoiceItems(invoicesFor(c, invoices), today)];
    /** The tasks behind the calendar chips, by id — the only ones the grid lets you edit or drag. */
    const calTasks: Record<string, Work> = Object.fromEntries(filtered.map((w) => [w.id, w]));
    /** The acting person as the calendar grid and quick edit see them. */
    const calActor = actorOf(member);
    /** One person's scope: their delivery hours per working day, so the grid can show each day's load against it. */
    const calScopeMember = filter.member ? findMember(team, filter.member) : undefined;
    const calPerDay = calScopeMember ? deliveryWeeklyHours(calScopeMember) / WORK_DAYS.length : undefined;
    const filterPhases = [...phaseNames, ...strayPhaseNames, ...(hasUnphased ? [NO_PHASE] : [])];

    // ---- Setup, invoices
    const checks = setupChecklist(c, invoices, today);
    const urgent = checks.filter((x) => !x.ok && x.urgent);
    const invoiceChecks = checks.filter((x) => x.key === "invoice");
    const linkedInvoices = invoicesFor(c, invoices).sort((a, b) => a.issueDate.localeCompare(b.issueDate));
    const unlinkedClientInvoices = invoices.filter((i) => i.clientName === c.clientName && !i.contractId && i.status !== "void");
    const clientQuotes = quotations.filter(
        (q) => q.clientName === c.clientName && (q.status === "accepted" || q.status === "converted" || q.status === "sent"),
    );
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));
    const ended = endedDaysAgo(c, today);
    const endsIn = endsInDays(c, today);
    const stageIdx = CONTRACT_STAGES.indexOf(c.stage);
    const nextStage = CONTRACT_STAGES[stageIdx + 1];
    /** Our own company's project: approved by management, no contract, no money. */
    const internal = Boolean(client?.internal);
    /** The gate: tasks and crew exist only once the contract is signed (or the brief approved). */
    const signed = isSigned(c);

    return {
        c,
        client,
        internal,
        signed,
        clientContracts,
        quotation,
        linked,
        member,
        today,
        thisMonth,
        activeTeam,
        memberNames,
        tab,
        boardHref,
        newTaskHref,
        error,
        actor,
        asParam,
        asField,
        asQ,
        allWorks,
        cWorks,
        phases,
        currentPhase,
        phaseWorks,
        phaseNames,
        strayPhaseNames,
        hasUnphased,
        canEdit,
        canEditPhases,
        handover,
        isAccountManager,
        isHandoverTarget,
        requirements,
        crew,
        generatedMonths,
        nextGenMonth,
        filter,
        view,
        group,
        months,
        wm,
        calYear,
        calMonth,
        calYm,
        keep,
        base,
        href,
        tabHref,
        phaseHref,
        noPhase,
        selectedPhase,
        scoped,
        p,
        overdueCount,
        next,
        calItems,
        calTasks,
        calActor,
        calPerDay,
        filterPhases,
        checks,
        urgent,
        invoiceChecks,
        linkedInvoices,
        unlinkedClientInvoices,
        clientQuotes,
        invoiceById,
        ended,
        endsIn,
        stageIdx,
        nextStage,
    };
}

export type ContractView = ReturnType<typeof deriveView>;
