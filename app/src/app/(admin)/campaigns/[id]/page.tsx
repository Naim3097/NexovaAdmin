import Link from "next/link";
import { notFound } from "next/navigation";
import {
    CAMPAIGN_FEE_MODELS,
    CAMPAIGN_OBJECTIVES,
    CAMPAIGN_PLATFORMS,
    CAMPAIGN_STATUSES,
    computeManagementFee,
    getCampaignById,
    totalsFor,
} from "@/lib/data/campaigns";
import { listLeads } from "@/lib/data/leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    addCampaignMetricAction,
    deleteCampaignAction,
    deleteCampaignMetricAction,
    setCampaignStatusAction,
    updateCampaignAction,
} from "@/lib/campaigns/actions";

export const dynamic = "force-dynamic";

function fmtMyr(n: number) {
    return `MYR ${n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}
function safeDiv(a: number, b: number) {
    return b > 0 ? a / b : 0;
}

export default async function CampaignDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const campaign = await getCampaignById(id);
    if (!campaign) notFound();

    const leads = await listLeads();
    const linkedLeads = leads.filter((l) => l.sourceCampaignId === id);
    const wonLeads = linkedLeads.filter((l) => l.status === "won");
    const wonRevenueMyr = wonLeads.reduce((s, l) => s + l.estValueMyr, 0);

    const totals = totalsFor(campaign.metrics);
    const cpm = safeDiv(totals.spendMyr, totals.impressions / 1000);
    const cpc = safeDiv(totals.spendMyr, totals.clicks);
    const ctr = safeDiv(totals.clicks, totals.impressions);
    const cvr = safeDiv(totals.conversionsReported, totals.clicks);
    const cplPlatform = safeDiv(totals.spendMyr, totals.leadsReported);
    const cplCrm = safeDiv(totals.spendMyr, linkedLeads.length);
    const cac = safeDiv(totals.spendMyr, wonLeads.length);
    const roas = safeDiv(wonRevenueMyr, totals.spendMyr);

    const today = new Date().toISOString().slice(0, 10);

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/campaigns"
                    className="text-sm text-muted-foreground hover:underline"
                >
                    Back to campaigns
                </Link>
                <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        {campaign.name}
                        <span className="text-muted-foreground"> · {campaign.clientName}</span>
                    </h1>
                    <Badge>{campaign.status}</Badge>
                </div>
            </div>

            {/* Status changer */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">Move to status</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                    {CAMPAIGN_STATUSES.map((s) => (
                        <form key={s} action={setCampaignStatusAction}>
                            <input type="hidden" name="id" value={campaign.id} />
                            <input type="hidden" name="status" value={s} />
                            <Button
                                type="submit"
                                size="sm"
                                variant={campaign.status === s ? "default" : "outline"}
                                disabled={campaign.status === s}
                            >
                                {s}
                            </Button>
                        </form>
                    ))}
                </div>
            </section>

            {/* ROI dashboard */}
            <section className="space-y-3 rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">Performance (lifetime)</h2>
                <div className="grid gap-3 md:grid-cols-4">
                    <Kpi label="Spend" value={fmtMyr(totals.spendMyr)} />
                    <Kpi label="Impressions" value={totals.impressions.toLocaleString()} />
                    <Kpi label="Clicks" value={totals.clicks.toLocaleString()} />
                    <Kpi
                        label="CTR"
                        value={`${(ctr * 100).toFixed(2)}%`}
                    />
                    <Kpi label="CPM" value={fmtMyr(cpm)} />
                    <Kpi label="CPC" value={fmtMyr(cpc)} />
                    <Kpi
                        label="Platform leads"
                        value={`${totals.leadsReported}`}
                        sub={
                            totals.leadsReported > 0
                                ? `CPL ${fmtMyr(cplPlatform)}`
                                : undefined
                        }
                    />
                    <Kpi
                        label="CRM leads"
                        value={`${linkedLeads.length}`}
                        sub={
                            linkedLeads.length > 0
                                ? `CPL ${fmtMyr(cplCrm)}`
                                : undefined
                        }
                    />
                    <Kpi
                        label="Conversions"
                        value={`${totals.conversionsReported}`}
                        sub={`CVR ${(cvr * 100).toFixed(2)}%`}
                    />
                    <Kpi
                        label="Won leads"
                        value={`${wonLeads.length}`}
                        sub={
                            wonLeads.length > 0 ? `CAC ${fmtMyr(cac)}` : undefined
                        }
                    />
                    <Kpi label="Won revenue" value={fmtMyr(wonRevenueMyr)} />
                    <Kpi
                        label="ROAS"
                        value={
                            totals.spendMyr > 0
                                ? `${roas.toFixed(2)}x`
                                : "—"
                        }
                    />
                </div>
            </section>

            {/* Client billing */}
            {campaign.feeModel !== "none" ? (
                <section className="space-y-3 rounded-lg border bg-card p-4 md:p-6">
                    <div>
                        <h2 className="text-sm font-medium">
                            Client billing (lifetime)
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            Management fee charged to {campaign.clientName} on
                            top of ad spend. Flat fee shown without proration
                            (treated as 1 month) — for monthly invoices use
                            the per-month breakdown.
                        </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                        <Kpi
                            label="Ad spend"
                            value={fmtMyr(totals.spendMyr)}
                        />
                        <Kpi
                            label="Mgmt fee"
                            value={fmtMyr(
                                computeManagementFee(campaign, totals.spendMyr),
                            )}
                            sub={
                                campaign.feeModel === "flat"
                                    ? `flat ${fmtMyr(campaign.flatFeeMyr)}`
                                    : campaign.feeModel === "percent"
                                        ? `${campaign.percentFee}% of spend`
                                        : `${fmtMyr(campaign.flatFeeMyr)} + ${campaign.percentFee}%`
                            }
                        />
                        <Kpi
                            label="Total billable"
                            value={fmtMyr(
                                totals.spendMyr +
                                computeManagementFee(
                                    campaign,
                                    totals.spendMyr,
                                ),
                            )}
                        />
                    </div>
                </section>
            ) : null}

            {/* Edit details */}
            <form
                action={updateCampaignAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <input type="hidden" name="id" value={campaign.id} />
                <h2 className="text-sm font-medium">Details</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Name</Label>
                        <Input name="name" defaultValue={campaign.name} required />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Client</Label>
                        <Input
                            name="clientName"
                            list="clients-datalist"
                            defaultValue={campaign.clientName}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Platform</Label>
                        <Select name="platform" defaultValue={campaign.platform}>
                            <SelectTrigger className="h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {CAMPAIGN_PLATFORMS.map((p) => (
                                    <SelectItem key={p} value={p}>
                                        {p}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Objective</Label>
                        <Select
                            name="objective"
                            defaultValue={campaign.objective}
                        >
                            <SelectTrigger className="h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {CAMPAIGN_OBJECTIVES.map((o) => (
                                    <SelectItem key={o} value={o}>
                                        {o}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Status</Label>
                        <Select name="status" defaultValue={campaign.status}>
                            <SelectTrigger className="h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {CAMPAIGN_STATUSES.map((s) => (
                                    <SelectItem key={s} value={s}>
                                        {s}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Monthly budget (MYR)</Label>
                        <Input
                            name="monthlyBudgetMyr"
                            type="number"
                            min={0}
                            step={0.01}
                            defaultValue={campaign.monthlyBudgetMyr}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Fee model</Label>
                        <Select
                            name="feeModel"
                            defaultValue={campaign.feeModel}
                        >
                            <SelectTrigger className="h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {CAMPAIGN_FEE_MODELS.map((f) => (
                                    <SelectItem key={f} value={f}>
                                        {f.replace(/_/g, " ")}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Flat fee (MYR / month)</Label>
                        <Input
                            name="flatFeeMyr"
                            type="number"
                            min={0}
                            step={0.01}
                            defaultValue={campaign.flatFeeMyr}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Percent fee (% of spend)</Label>
                        <Input
                            name="percentFee"
                            type="number"
                            min={0}
                            step={0.1}
                            defaultValue={campaign.percentFee}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Start date</Label>
                        <Input
                            name="startDate"
                            type="date"
                            defaultValue={campaign.startDate}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">End date</Label>
                        <Input
                            name="endDate"
                            type="date"
                            defaultValue={campaign.endDate}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">External ID</Label>
                        <Input
                            name="externalId"
                            defaultValue={campaign.externalId}
                            placeholder="Meta campaign id, etc."
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Landing URL</Label>
                        <Input
                            name="landingUrl"
                            type="url"
                            defaultValue={campaign.landingUrl}
                        />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Notes</Label>
                    <Textarea
                        name="notes"
                        rows={3}
                        defaultValue={campaign.notes}
                    />
                </div>
                <div className="flex justify-end">
                    <Button type="submit">Save changes</Button>
                </div>
            </form>

            {/* Add metric */}
            <form
                action={addCampaignMetricAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <input type="hidden" name="id" value={campaign.id} />
                <div>
                    <h2 className="text-sm font-medium">Add daily snapshot</h2>
                    <p className="text-xs text-muted-foreground">
                        Same-date entries overwrite. Pull these numbers from your
                        platform UI until API access is granted.
                    </p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Date</Label>
                        <Input
                            name="date"
                            type="date"
                            required
                            defaultValue={today}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Spend (MYR)</Label>
                        <Input
                            name="spendMyr"
                            type="number"
                            min={0}
                            step={0.01}
                            defaultValue={0}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Impressions</Label>
                        <Input
                            name="impressions"
                            type="number"
                            min={0}
                            step={1}
                            defaultValue={0}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Clicks</Label>
                        <Input
                            name="clicks"
                            type="number"
                            min={0}
                            step={1}
                            defaultValue={0}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Leads (platform)</Label>
                        <Input
                            name="leadsReported"
                            type="number"
                            min={0}
                            step={1}
                            defaultValue={0}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Conversions</Label>
                        <Input
                            name="conversionsReported"
                            type="number"
                            min={0}
                            step={1}
                            defaultValue={0}
                        />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Notes</Label>
                    <Input name="notes" placeholder="e.g. tested new creative" />
                </div>
                <div className="flex justify-end">
                    <Button type="submit">Add snapshot</Button>
                </div>
            </form>

            {/* Metrics table */}
            <section className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">
                    Daily snapshots ({campaign.metrics.length})
                </div>
                {campaign.metrics.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        No snapshots yet.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-2">Date</th>
                                    <th className="px-4 py-2 text-right">Spend</th>
                                    <th className="px-4 py-2 text-right">Impr.</th>
                                    <th className="px-4 py-2 text-right">Clicks</th>
                                    <th className="px-4 py-2 text-right">Leads</th>
                                    <th className="px-4 py-2 text-right">Conv.</th>
                                    <th className="px-4 py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...campaign.metrics]
                                    .sort((a, b) =>
                                        b.date.localeCompare(a.date),
                                    )
                                    .map((m) => (
                                        <tr key={m.id} className="border-t">
                                            <td className="px-4 py-2 font-medium">
                                                {m.date}
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                {fmtMyr(m.spendMyr)}
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                {m.impressions.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                {m.clicks.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                {m.leadsReported}
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                {m.conversionsReported}
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <form
                                                    action={
                                                        deleteCampaignMetricAction
                                                    }
                                                >
                                                    <input
                                                        type="hidden"
                                                        name="id"
                                                        value={campaign.id}
                                                    />
                                                    <input
                                                        type="hidden"
                                                        name="metricId"
                                                        value={m.id}
                                                    />
                                                    <Button
                                                        type="submit"
                                                        size="sm"
                                                        variant="ghost"
                                                    >
                                                        Delete
                                                    </Button>
                                                </form>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Linked leads */}
            <section className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">
                    Attributed CRM leads ({linkedLeads.length})
                </div>
                {linkedLeads.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        No leads tagged to this campaign yet. On the lead form,
                        choose this campaign in the &ldquo;Source campaign&rdquo;
                        select.
                    </p>
                ) : (
                    <ul className="divide-y">
                        {linkedLeads.map((l) => (
                            <li
                                key={l.id}
                                className="flex flex-col gap-1 p-4 md:flex-row md:items-center md:justify-between"
                            >
                                <Link
                                    href={`/leads/${l.id}`}
                                    className="font-medium hover:underline"
                                >
                                    {l.name}
                                    {l.company ? (
                                        <span className="text-muted-foreground">
                                            {" "}
                                            · {l.company}
                                        </span>
                                    ) : null}
                                </Link>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    {l.estValueMyr > 0 ? (
                                        <span>{fmtMyr(l.estValueMyr)}</span>
                                    ) : null}
                                    <Badge variant="outline">{l.status}</Badge>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Delete */}
            <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-center md:justify-between md:p-6">
                <div>
                    <h2 className="text-sm font-medium">Danger zone</h2>
                    <p className="text-xs text-muted-foreground">
                        Deletes the campaign and all its snapshots. CRM leads tagged
                        to it are kept (their attribution becomes orphaned).
                    </p>
                </div>
                <form action={deleteCampaignAction}>
                    <input type="hidden" name="id" value={campaign.id} />
                    <Button type="submit" variant="destructive">
                        Delete campaign
                    </Button>
                </form>
            </section>

            <p className="text-xs text-muted-foreground">
                Created {new Date(campaign.createdAt).toLocaleString()} · Last
                updated {new Date(campaign.updatedAt).toLocaleString()}
            </p>
        </div>
    );
}

function Kpi({
    label,
    value,
    sub,
}: {
    label: string;
    value: string;
    sub?: string;
}) {
    return (
        <div className="rounded-md border bg-background p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-base font-semibold">{value}</p>
            {sub ? (
                <p className="text-xs text-muted-foreground">{sub}</p>
            ) : null}
        </div>
    );
}
