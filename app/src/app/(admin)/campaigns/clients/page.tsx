import Link from "next/link";
import {
    computeManagementFee,
    listCampaigns,
    totalsFor,
    type Campaign,
} from "@/lib/data/campaigns";
import { listLeads } from "@/lib/data/leads";

export const dynamic = "force-dynamic";

function fmtMyr(n: number) {
    return `MYR ${n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

type ClientRollup = {
    clientName: string;
    campaigns: Campaign[];
    spend: number;
    leadsReported: number;
    crmLeads: number;
    wonRevenue: number;
    mgmtFee: number;
    activeCount: number;
};

export default async function CampaignsByClientPage() {
    const [campaigns, leads] = await Promise.all([
        listCampaigns(),
        listLeads(),
    ]);

    const byClient = new Map<string, ClientRollup>();
    for (const c of campaigns) {
        const t = totalsFor(c.metrics);
        const crmLeads = leads.filter((l) => l.sourceCampaignId === c.id);
        const wonRevenue = crmLeads
            .filter((l) => l.status === "won")
            .reduce((s, l) => s + l.estValueMyr, 0);
        const fee = computeManagementFee(c, t.spendMyr);
        const r = byClient.get(c.clientName) ?? {
            clientName: c.clientName,
            campaigns: [],
            spend: 0,
            leadsReported: 0,
            crmLeads: 0,
            wonRevenue: 0,
            mgmtFee: 0,
            activeCount: 0,
        };
        r.campaigns.push(c);
        r.spend += t.spendMyr;
        r.leadsReported += t.leadsReported;
        r.crmLeads += crmLeads.length;
        r.wonRevenue += wonRevenue;
        r.mgmtFee += fee;
        if (c.status === "live") r.activeCount += 1;
        byClient.set(c.clientName, r);
    }

    // Sort: in-house ("Nexov") first if present, then by spend desc.
    const rollups = Array.from(byClient.values()).sort((a, b) => {
        if (a.clientName === "Nexov" && b.clientName !== "Nexov") return -1;
        if (b.clientName === "Nexov" && a.clientName !== "Nexov") return 1;
        return b.spend - a.spend;
    });

    const grandSpend = rollups.reduce((s, r) => s + r.spend, 0);
    const grandFee = rollups.reduce((s, r) => s + r.mgmtFee, 0);
    const grandWon = rollups.reduce((s, r) => s + r.wonRevenue, 0);

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/campaigns"
                    className="text-sm text-muted-foreground hover:underline"
                >
                    ← Back to campaigns
                </Link>
                <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
                    Campaigns by client
                </h1>
                <p className="text-sm text-muted-foreground">
                    Lifetime rollup. Useful for monthly client reviews and
                    invoicing the management fee.
                </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
                <Kpi label="Total ad spend" value={fmtMyr(grandSpend)} />
                <Kpi label="Total mgmt fee" value={fmtMyr(grandFee)} />
                <Kpi
                    label="Won revenue (CRM)"
                    value={fmtMyr(grandWon)}
                />
            </div>

            <div className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">
                    Clients ({rollups.length})
                </div>
                {rollups.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        No campaigns yet.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-2 text-left">Client</th>
                                    <th className="px-4 py-2 text-right">Active</th>
                                    <th className="px-4 py-2 text-right">Spend</th>
                                    <th className="px-4 py-2 text-right">
                                        Mgmt fee
                                    </th>
                                    <th className="px-4 py-2 text-right">
                                        CRM leads
                                    </th>
                                    <th className="px-4 py-2 text-right">
                                        Won revenue
                                    </th>
                                    <th className="px-4 py-2 text-right">ROAS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rollups.map((r) => {
                                    const roas =
                                        r.spend > 0
                                            ? r.wonRevenue / r.spend
                                            : 0;
                                    return (
                                        <tr key={r.clientName} className="border-b last:border-b-0">
                                            <td className="px-4 py-3 font-medium">
                                                <Link
                                                    href={`/campaigns?client=${encodeURIComponent(r.clientName)}`}
                                                    className="hover:underline"
                                                >
                                                    {r.clientName}
                                                </Link>
                                                <span className="ml-2 text-xs text-muted-foreground">
                                                    ({r.campaigns.length})
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {r.activeCount}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {fmtMyr(r.spend)}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {r.mgmtFee > 0
                                                    ? fmtMyr(r.mgmtFee)
                                                    : "—"}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {r.crmLeads}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {fmtMyr(r.wonRevenue)}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {r.spend > 0
                                                    ? `${roas.toFixed(2)}x`
                                                    : "—"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function Kpi({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-semibold">{value}</p>
        </div>
    );
}
