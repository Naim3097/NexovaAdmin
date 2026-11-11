import { isMockup } from "@/lib/dev-store/root";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
    BarChart3,
    Bell,
    Briefcase,
    Building2,
    CalendarDays,
    ClipboardCheck,
    ClipboardList,
    FileBarChart,
    FileText,
    Globe,
    KanbanSquare,
    LayoutDashboard,
    ListChecks,
    ListTodo,
    Megaphone,
    Receipt,
    ScrollText,
    Search,
    Settings,
    UserCog,
    UserRound,
    Users,
    type LucideIcon,
} from "lucide-react";
import {
    getAccessLevel,
    getActingMember,
    getCurrentClient,
    getCurrentTeamMember,
    getCurrentUser,
} from "@/lib/auth";
import { FUNCTION_LABEL, listTeamMembers, type TeamMember } from "@/lib/data/team";
import { SYSTEM_ROLE_LABEL, canSee, functionsOf, hasFunction, hasRole, homeFor, isManager, rolesOf } from "@/lib/roles";
import { clearActingMemberAction, setActingMemberAction } from "@/lib/team/acting";
import { Logo } from "@/components/logo";
import { ClientNameDatalist } from "@/components/client-name-datalist";
import { ServiceNameDatalist } from "@/components/service-name-datalist";
import { SignOutButton } from "@/components/sign-out-button";
import { unreadCount } from "@/lib/data/notifications";
import { listLeads } from "@/lib/data/leads";
import { SidebarNav, MobileNav, type NavItem, type NavSection } from "./admin-nav";

/** Mirrors the check in auth.ts / proxy.ts: no login, pages run as whoever is picked. */
const DEV_BYPASS =
    process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "1";

// ---------------------------------------------------------------------------
// Nav model. Lives here (server) so visibility can run through `canSee`; the
// client nav only renders what it is handed.
// ---------------------------------------------------------------------------

type NavDef = { href: string; label: string; icon: LucideIcon };

/**
 * Overview is five entries at most. The Dashboard (managers, and the sales /
 * finance / account-manager duties) carries the Team, Money and Activity tabs
 * that used to be /management, /finance and /activity; those paths redirect
 * into it. My accounts shows for the account-manager duty and managers.
 * `canSee` decides both, in `navFor`.
 */
const SECTIONS: { label: string; items: NavDef[] }[] = [
    {
        label: "Overview",
        items: [
            { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
            { href: "/my-work", label: "My tasks", icon: ListChecks },
            { href: "/my-clients", label: "My accounts", icon: Briefcase },
            { href: "/calendar", label: "Calendar", icon: CalendarDays },
            { href: "/notifications", label: "Inbox", icon: Bell },
        ],
    },
    {
        label: "Prospects",
        items: [
            { href: "/leads", label: "Leads", icon: Users },
            { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
        ],
    },
    {
        label: "Client Management",
        items: [
            { href: "/onboarding", label: "Onboarding", icon: ClipboardList },
            { href: "/settings/clients", label: "Clients", icon: Building2 },
            { href: "/contracts", label: "Contracts", icon: ClipboardCheck },
            { href: "/reports", label: "Reports", icon: BarChart3 },
        ],
    },
    {
        label: "Delivery",
        items: [
            { href: "/works", label: "Tasks", icon: ListChecks },
            { href: "/campaigns", label: "Campaigns", icon: Megaphone },
            { href: "/content", label: "Content", icon: FileText },
            { href: "/seo", label: "SEO", icon: Search },
            { href: "/website", label: "Website", icon: Globe },
            { href: "/custom-tasks", label: "Other tasks", icon: ListTodo },
        ],
    },
    {
        label: "Finances",
        items: [
            { href: "/quotes", label: "Quotes", icon: ScrollText },
            { href: "/invoices", label: "Invoices", icon: Receipt },
        ],
    },
    {
        label: "Admin",
        items: [
            { href: "/team", label: "Team", icon: UserCog },
            { href: "/settings", label: "Settings", icon: Settings },
        ],
    },
];

/**
 * Non-admins don't get the financial Reports hub; they get the two surfaces
 * they can use instead. (The hub page is guarded by requireAdminAccess.)
 */
const REPORT_SURFACES: NavDef[] = [
    { href: "/reports/weekly", label: "Weekly updates", icon: BarChart3 },
    { href: "/reports/client", label: "Client reports", icon: FileBarChart },
];

const TAB = {
    dashboard: { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    myWork: { href: "/my-work", label: "My tasks", icon: ListChecks },
    myClients: { href: "/my-clients", label: "My accounts", icon: Briefcase },
    calendar: { href: "/calendar", label: "Calendar", icon: CalendarDays },
    leads: { href: "/leads", label: "Leads", icon: Users },
    pipeline: { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
    contracts: { href: "/contracts", label: "Contracts", icon: ClipboardCheck },
    works: { href: "/works", label: "Tasks", icon: ListChecks },
    invoices: { href: "/invoices", label: "Invoices", icon: Receipt },
    quotes: { href: "/quotes", label: "Quotes", icon: ScrollText },
} satisfies Record<string, NavDef>;

/** Nobody resolved (bypass, nothing picked): the manager's set. */
const TABS_ALL: NavDef[] = [TAB.dashboard, TAB.myWork, TAB.contracts];

/**
 * Bottom tabs: the three pages the member's biggest hat uses most, in the
 * order managers → account manager → sales → finance → plain user. "More"
 * (every other page) is appended by the nav, and `navFor` still runs each
 * set through `canSee`.
 */
function tabsFor(member: TeamMember | null): NavDef[] {
    if (!member) return TABS_ALL;
    if (isManager(member)) return [TAB.dashboard, TAB.myWork, TAB.contracts];
    if (hasFunction(member, "account_manager")) return [TAB.myClients, TAB.myWork, TAB.contracts];
    if (hasFunction(member, "sales")) return [TAB.dashboard, TAB.pipeline, TAB.leads];
    if (hasFunction(member, "finance")) return [TAB.dashboard, TAB.invoices, TAB.quotes];
    return [TAB.myWork, TAB.calendar, TAB.works];
}

function toItem({ href, label, icon: Icon }: NavDef): NavItem {
    return { href, label, icon: <Icon aria-hidden="true" /> };
}

/**
 * Sections and tabs for this member. `member` null means "no one resolved" —
 * under the bypass with nothing picked, or a login not linked to a member row
 * yet — and shows everything so nobody is ever locked out of the nav.
 */
function navFor(member: TeamMember | null, isAdmin: boolean) {
    const visible = (href: string) => !member || canSee(member, href);
    const sections: NavSection[] = SECTIONS.map((sec) => ({
        label: sec.label,
        items: sec.items
            .flatMap((i) => (i.href === "/reports" && !isAdmin ? REPORT_SURFACES : [i]))
            .filter((i) => visible(i.href))
            .map(toItem),
    })).filter((s) => s.items.length > 0);
    const tabs: NavItem[] = tabsFor(member)
        .filter((i) => visible(i.href))
        .map(toItem);
    return { sections, tabs };
}

/** "Admin · Sales, Finance" — the role, then the functions. */
function hatsLine(m: TeamMember): string {
    const roles = rolesOf(m).map((r) => SYSTEM_ROLE_LABEL[r]).join(", ");
    const fns = functionsOf(m).map((f) => FUNCTION_LABEL[f]).join(", ");
    return fns ? `${roles} · ${fns}` : roles;
}

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    // Invited users must choose a password before entering the app.
    if (user.user_metadata?.needs_password) redirect("/auth/set-password");
    // Client logins are NOT agency staff — keep them out of the admin and send
    // them to their portal. (Permissions are otherwise open, so this redirect
    // is what stops a client account from reaching agency data.)
    const client = await getCurrentClient();
    if (client) redirect("/portal");
    const [member, linked, unread, access, freshLeads] = await Promise.all([
        // The linked member, or under the bypass whoever the sidebar picked.
        getActingMember(),
        getCurrentTeamMember(),
        unreadCount().catch(() => 0),
        getAccessLevel(),
        // Unattended auto-intake leads — drives the neon "new" count on the
        // Leads nav item until every one of them has been acted on.
        listLeads()
            .then((ls) => ls.filter((l) => l.autoIntake).length)
            .catch(() => 0),
    ]);
    // "Acting as" under the bypass follows the picked person's roles so the
    // simulation is honest; a real login keeps the legacy level (bootstrap
    // rule included); nobody picked = the bypass user stays admin.
    const simulated = Boolean(member) && !linked;
    const isAdmin = simulated ? hasRole(member, "admin") : access === "admin";
    const { sections, tabs } = navFor(member, isAdmin);
    // The logo: managers (and nobody resolved) land on the Dashboard, users on My tasks.
    const home = homeFor(member);
    // The picker only needs the team when nobody is picked yet.
    const team = DEV_BYPASS && !member ? await listTeamMembers().catch(() => []) : [];

    const displayName = member?.name ?? user.email ?? "Account";
    const initial = (member?.name ?? user.email ?? "?").charAt(0).toUpperCase();
    const roleLine = member ? hatsLine(member) : "";

    return (
        <div className="canvas-glow flex min-h-dvh flex-col bg-background md:flex-row">
            {/* Skip link for keyboard users */}
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
            >
                Skip to content
            </a>

            {/* Desktop sidebar — floating glass panel */}
            <aside className="sticky top-0 hidden h-dvh shrink-0 md:flex md:w-[17.5rem] md:flex-col md:p-3 md:pr-0">
                <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/70 shadow-sm backdrop-blur-xl">
                    <div className="flex h-16 items-center border-b border-border/60 px-5">
                        <Link href={home} aria-label="NexOps — home">
                            <Logo className="h-6" />
                        </Link>
                    </div>
                    <SidebarNav
                        sections={sections}
                        unread={unread}
                        freshLeads={freshLeads}
                    />
                    <div className="space-y-2 p-3">
                        {DEV_BYPASS && !linked ? (
                            member ? (
                                <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 px-2.5 py-2 text-xs">
                                    <p className="text-muted-foreground">Acting as</p>
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="min-w-0 truncate">
                                            <span className="font-medium text-foreground">{member.name}</span>
                                            <span className="text-muted-foreground"> · {roleLine}</span>
                                        </p>
                                        <form action={clearActingMemberAction}>
                                            <button
                                                type="submit"
                                                className="shrink-0 rounded-md border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                Change
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            ) : (
                                <form
                                    action={setActingMemberAction}
                                    className="rounded-xl border border-dashed border-primary/40 bg-primary/5 px-2.5 py-2 text-xs"
                                >
                                    <label htmlFor="acting-as" className="text-muted-foreground">
                                        Acting as
                                    </label>
                                    <div className="mt-1 flex items-center gap-1.5">
                                        <select
                                            id="acting-as"
                                            name="as"
                                            defaultValue=""
                                            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            <option value="">— choose —</option>
                                            {team.filter((m) => m.active).map((m) => (
                                                <option key={m.id} value={m.name}>
                                                    {m.name} · {hatsLine(m)}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="submit"
                                            className="h-8 shrink-0 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            Go
                                        </button>
                                    </div>
                                </form>
                            )
                        ) : null}
                        <Link
                            href="/profile"
                            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <UserRound className="size-3.5" aria-hidden="true" />
                            Profile
                        </Link>
                        <div className="flex items-center gap-2.5 rounded-xl bg-muted/60 p-2.5">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-semibold text-white shadow-sm">
                                {initial}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                    {displayName}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                    {member?.role ?? user.email}
                                </p>
                            </div>
                            <SignOutButton />
                        </div>
                    </div>
                </div>
            </aside>

            {/* Top bar (mobile) — glass */}
            <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl md:hidden">
                <Link href={home} aria-label="NexOps — home">
                    <Logo className="h-5" />
                </Link>
                <div className="flex items-center gap-3">
                    <Link
                        href="/notifications"
                        className="relative inline-flex items-center text-muted-foreground"
                        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
                    >
                        <Bell className="size-5" />
                        {unread > 0 ? (
                            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                                {unread > 9 ? "9+" : unread}
                            </span>
                        ) : null}
                    </Link>
                    <Link
                        href="/profile"
                        className="flex size-8 items-center justify-center rounded-full bg-brand-gradient text-xs font-semibold text-white shadow-sm"
                        aria-label={`Open your profile (signed in as ${displayName})`}
                    >
                        {initial}
                    </Link>
                </div>
            </header>

            <main
                id="main-content"
                className="flex-1 overflow-y-auto p-4 pb-24 md:p-8 md:pb-10"
            >
                {isMockup() ? (
                    <div className="mx-auto mb-4 w-full max-w-6xl rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                        NexOps 2.0 mock-up · demo data that resets now and then · pick who you are in the sidebar to see their view.
                    </div>
                ) : null}
                <div className="mx-auto w-full max-w-6xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
                    {children}
                </div>
                {/* Shared datalists used by autocomplete inputs across forms */}
                <ClientNameDatalist />
                <ServiceNameDatalist />
            </main>

            <MobileNav sections={sections} tabs={tabs} unread={unread} freshLeads={freshLeads} />
        </div>
    );
}
