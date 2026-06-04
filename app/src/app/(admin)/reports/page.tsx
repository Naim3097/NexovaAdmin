import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buildMonthlySummary } from "@/lib/reports";
import { getAgencyProfile } from "@/lib/data/agency";

export const dynamic = "force-dynamic";

const fmtMyr = (n: number) =>
    `MYR ${n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

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
            projectsCreated: acc.projectsCreated + r.projectsCreated,
            projectsDelivered: acc.projectsDelivered + r.projectsDelivered,
            invoicesIssued: acc.invoicesIssued + r.invoicesIssued,
            invoicesPaid: acc.invoicesPaid + r.invoicesPaid,
            billedMyr: acc.billedMyr + r.billedMyr,
            paidMyr: acc.paidMyr + r.paidMyr,
            adSpendMyr: acc.adSpendMyr + r.adSpendMyr,
        }),
        {
            leadsCreated: 0,
            leadsWon: 0,
            projectsCreated: 0,
            projectsDelivered: 0,
            invoicesIssued: 0,
            invoicesPaid: 0,
            billedMyr: 0,
            paidMyr: 0,
            adSpendMyr: 0,
        },
    );

    const downloads: Array<{
        kind: "monthly" | "invoices" | "leads" | "projects" | "campaigns";
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
                kind: "invoices",
                label: "Invoices",
                hint: "All invoices with computed subtotal/tax/total",
                href: "/reports/export?kind=invoices",
            },
            {
                kind: "leads",
                label: "Leads",
                hint: "All leads with source, status, est value",
                href: "/reports/export?kind=leads",
            },
            {
                kind: "projects",
                label: "Projects",
                hint: "Phase, deliverables, signoff status",
                href: "/reports/export?kind=projects",
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
                    one-click CSV exports. Open in Excel, Google Sheets, or
                    Numbers.
                </p>
                <div className="mt-3">
                    <Link
                        href="/reports/client"
                        className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                        })}
                    >
                        Client monthly report →
                    </Link>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <span>Monthly summary</span>
                        <div className="flex gap-1">
                            {yearOptions.map((y) => (
                                <Link
                                    key={y}
                                    href={`/reports?year=${y}`}
                                    aria-current={y === year ? "page" : undefined}
                                >
                                    <Badge
                                        variant={
                                            y === year ? "default" : "outline"
                                        }
                                    >
                                        {y}
                                    </Badge>
                                </Link>
                            ))}
                        </div>
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
                                        Projects (new / delivered)
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
                                        r.projectsCreated === 0 &&
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
                                                {r.projectsCreated} /{" "}
                                                {r.projectsDelivered}
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
                                        {totals.projectsCreated} /{" "}
                                        {totals.projectsDelivered}
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
                Note: Drafts and voided invoices are excluded from billed
                totals. Paid totals are bucketed by paid date, not issue date.
            </p>
        </div>
    );
}
