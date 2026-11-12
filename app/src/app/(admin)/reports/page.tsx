import Link from "next/link";
import { redirect } from "next/navigation";
import { getActingMember, requireTeamAccess } from "@/lib/auth";
import { canSee, homeFor } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { buildMonthlySummary } from "@/lib/reports";
import { getAgencyProfile } from "@/lib/data/agency";
import { fmtMyrWhole as fmtMyr } from "@/lib/format";
import { SelectNav } from "@/components/select-nav";

export const dynamic = "force-dynamic";

const MONTH_LABELS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

export default async function ReportsPage({
    searchParams,
}: {
    searchParams: Promise<{ year?: string }>;
}) {
    await requireTeamAccess();
    // Reports: management and the delivery or finance duty.
    const member = await getActingMember();
    if (!canSee(member, "/reports")) redirect(homeFor(member));
    const sp = await searchParams;
    const currentYear = new Date().getFullYear();
    const requested = sp.year ? Number.parseInt(sp.year, 10) : currentYear;
    const year = Number.isFinite(requested) ? requested : currentYear;
    const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

    const monthly = await buildMonthlySummary(year);
    const agency = await getAgencyProfile();

    const totals = monthly.reduce(
        (acc, r) => ({
            leadsCreated: acc.leadsCreated + r.leadsCreated,
            leadsWon: acc.leadsWon + r.leadsWon,
            contractsStarted: acc.contractsStarted + r.contractsStarted,
            tasksCompleted: acc.tasksCompleted + r.tasksCompleted,
            quotesSent: acc.quotesSent + r.quotesSent,
            quotesAccepted: acc.quotesAccepted + r.quotesAccepted,
            invoicesIssued: acc.invoicesIssued + r.invoicesIssued,
            invoicesPaid: acc.invoicesPaid + r.invoicesPaid,
            billedMyr: acc.billedMyr + r.billedMyr,
            paidMyr: acc.paidMyr + r.paidMyr,
            adSpendMyr: acc.adSpendMyr + r.adSpendMyr,
        }),
        {
            leadsCreated: 0,
            leadsWon: 0,
            contractsStarted: 0,
            tasksCompleted: 0,
            quotesSent: 0,
            quotesAccepted: 0,
            invoicesIssued: 0,
            invoicesPaid: 0,
            billedMyr: 0,
            paidMyr: 0,
            adSpendMyr: 0,
        },
    );

    const downloads: Array<{
        kind:
            | "monthly"
            | "quotations"
            | "invoices"
            | "leads"
            | "tasks"
            | "campaigns";
        label: string;
        hint: string;
        href: string;
    }> = [
            {
                kind: "monthly",
                label: "Monthly summary",
                hint: `12 rows for ${year} — counts + revenue + ad spend`,
                href: `/reports/export?kind=monthly&year=${year}`,
            },
            {
                kind: "quotations",
                label: "Quotes",
                hint: "All quotes with subtotal, tax and total",
                href: "/reports/export?kind=quotations",
            },
            {
                kind: "invoices",
                label: "Invoices",
                hint: "All invoices with subtotal, tax and total",
                href: "/reports/export?kind=invoices",
            },
            {
                kind: "leads",
                label: "Leads",
                hint: "All leads with source, stage and estimated value",
                href: "/reports/export?kind=leads",
            },
            {
                kind: "tasks",
                label: "Contract tasks",
                hint: "Every task with contract code, month, phase, due date, status and owners",
                href: "/reports/export?kind=tasks",
            },
            {
                kind: "campaigns",
                label: "Campaigns",
                hint: "Ad spend, impressions, clicks, CPC, CPL (lifetime)",
                href: "/reports/export?kind=campaigns",
            },
        ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Reports</h1>
                <p className="text-sm text-muted-foreground">
                    {agency.displayName || agency.legalName || "Agency"} ·
                    one-click CSV exports for Excel, Google Sheets or Numbers.
                </p>
                <div className="mt-3">
                    <Link
                        href="/reports/weekly"
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                        Weekly updates
                    </Link>{" "}
                    <Link
                        href="/reports/client"
                        className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                        })}
                    >
                        Client monthly report
                    </Link>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <span>Monthly summary</span>
                        <SelectNav
                            label="Year"
                            value={String(year)}
                            options={yearOptions.map((y) => ({
                                value: String(y),
                                label: String(y),
                                href: `/reports?year=${y}`,
                            }))}
                        />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b text-left text-muted-foreground">
                                <tr>
                                    <th className="py-2 pr-4 font-medium">
                                        Month
                                    </th>
                                    <th className="py-2 pr-4 font-medium">
                                        Leads (new / won)
                                    </th>
                                    <th className="py-2 pr-4 font-medium">
                                        Contracts started / tasks done
                                    </th>
                                    <th className="py-2 pr-4 font-medium">
                                        Quotes (sent / accepted)
                                    </th>
                                    <th className="py-2 pr-4 font-medium">
                                        Invoices (issued / paid)
                                    </th>
                                    <th className="py-2 pr-4 font-medium">
                                        Billed
                                    </th>
                                    <th className="py-2 pr-4 font-medium">
                                        Paid
                                    </th>
                                    <th className="py-2 font-medium">
                                        Ad spend
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {monthly.map((r, i) => {
                                    const empty =
                                        r.leadsCreated === 0 &&
                                        r.contractsStarted === 0 &&
                                        r.tasksCompleted === 0 &&
                                        r.invoicesIssued === 0 &&
                                        r.invoicesPaid === 0 &&
                                        r.adSpendMyr === 0;
                                    return (
                                        <tr
                                            key={r.month}
                                            className={`border-b ${empty
                                                ? "text-muted-foreground"
                                                : ""
                                                }`}
                                        >
                                            <td className="py-2 pr-4 font-medium">
                                                {MONTH_LABELS[i]}
                                            </td>
                                            <td className="py-2 pr-4">
                                                {r.leadsCreated} /{" "}
                                                {r.leadsWon}
                                            </td>
                                            <td className="py-2 pr-4">
                                                {r.contractsStarted} /{" "}
                                                {r.tasksCompleted}
                                            </td>
                                            <td className="py-2 pr-4">
                                                {r.quotesSent} /{" "}
                                                {r.quotesAccepted}
                                            </td>
                                            <td className="py-2 pr-4">
                                                {r.invoicesIssued} /{" "}
                                                {r.invoicesPaid}
                                            </td>
                                            <td className="py-2 pr-4">
                                                {fmtMyr(r.billedMyr)}
                                            </td>
                                            <td className="py-2 pr-4">
                                                {fmtMyr(r.paidMyr)}
                                            </td>
                                            <td className="py-2">
                                                {fmtMyr(r.adSpendMyr)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="font-semibold">
                                <tr>
                                    <td className="py-2 pr-4">Year total</td>
                                    <td className="py-2 pr-4">
                                        {totals.leadsCreated} /{" "}
                                        {totals.leadsWon}
                                    </td>
                                    <td className="py-2 pr-4">
                                        {totals.contractsStarted} /{" "}
                                        {totals.tasksCompleted}
                                    </td>
                                    <td className="py-2 pr-4">
                                        {totals.quotesSent} /{" "}
                                        {totals.quotesAccepted}
                                    </td>
                                    <td className="py-2 pr-4">
                                        {totals.invoicesIssued} /{" "}
                                        {totals.invoicesPaid}
                                    </td>
                                    <td className="py-2 pr-4">
                                        {fmtMyr(totals.billedMyr)}
                                    </td>
                                    <td className="py-2 pr-4">
                                        {fmtMyr(totals.paidMyr)}
                                    </td>
                                    <td className="py-2">
                                        {fmtMyr(totals.adSpendMyr)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Downloads</CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="divide-y">
                        {downloads.map((d) => (
                            <li
                                key={d.kind}
                                className="flex items-center justify-between gap-4 py-3"
                            >
                                <div>
                                    <div className="font-medium">{d.label}</div>
                                    <div className="text-sm text-muted-foreground">
                                        {d.hint}
                                    </div>
                                </div>
                                <Link
                                    href={d.href}
                                    prefetch={false}
                                    className={buttonVariants({
                                        variant: "outline",
                                    })}
                                >
                                    Download CSV
                                </Link>
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground">
                Drafts and voided invoices are left out of billed totals; paid totals go by paid date, not issue date.
            </p>
        </div>
    );
}
