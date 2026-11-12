import Link from "next/link";
import {
    CAMPAIGN_FEE_MODELS,
    CAMPAIGN_OBJECTIVES,
    CAMPAIGN_PLATFORMS,
    computeManagementFee,
    listCampaigns,
    totalsFor,
    type CampaignStatus,
} from "@/lib/data/campaigns";
import { listLeads } from "@/lib/data/leads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createCampaignAction } from "@/lib/campaigns/actions";
import { listContracts } from "@/lib/data/contracts";
import { listWorks } from "@/lib/data/works";
import { getActingMember } from "@/lib/auth";
import { assignedContractIds, seesEverything, visibleContracts } from "@/lib/scope";
import { fmtMyr, fmtMyrShort } from "@/lib/format";
import { SelectNav } from "@/components/select-nav";
import { NewSection } from "@/components/new-button";

export const dynamic = "force-dynamic";

const norm = (s: string) => s.trim().toLowerCase();

const STATUS_VARIANT: Record<
    CampaignStatus,
    "default" | "secondary" | "destructive" | "outline"
> = {
    planning: "outline",
    live: "default",
    paused: "secondary",
    ended: "outline",
};

export default async function CampaignsPage({
    searchParams,
}: {
    searchParams: Promise<{ client?: string; as?: string; new?: string }>;
}) {
    const { client: clientFilter = "", as, new: openNew } = await searchParams;
    const [everyCampaign, leads, allContracts, works, member] = await Promise.all([
        listCampaigns(),
        listLeads(),
        listContracts(),
        listWorks(),
        getActingMember(as),
    ]);
    // A user sees the campaigns of the projects they are on: linked by project, else by the project's client name.
    const contracts = visibleContracts(member, allContracts, works);
    const myContractIds = assignedContractIds(member, allContracts, works);
    const myClientNames = new Set(contracts.map((c) => norm(c.clientName)));
    const allCampaigns = seesEverything(member)
        ? everyCampaign
        : everyCampaign.filter((c) => (c.contractId && myContractIds.has(c.contractId)) || myClientNames.has(norm(c.clientName)));
    const openContracts = contracts.filter((c) => c.status === "active" || c.status === "draft");
    const campaigns = clientFilter
        ? allCampaigns.filter((c) => c.clientName === clientFilter)
        : allCampaigns;
    const clientNames = Array.from(
        new Set(allCampaigns.map((c) => c.clientName).filter(Boolean)),
    ).sort();

    // Lifetime totals across all campaigns
    const lifetime = campaigns.reduce(
        (acc, c) => {
            const t = totalsFor(c.metrics);
            acc.spend += t.spendMyr;
            acc.leads += t.leadsReported;
            return acc;
        },
        { spend: 0, leads: 0 },
    );
    const crmAttributed = leads.filter((l) => l.sourceCampaignId).length;
    const today = new Date().toISOString().slice(0, 10);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">Campaigns</h1>
                    <p className="text-sm text-muted-foreground">
                        Entered by hand until the Meta, Google and TikTok APIs unfreeze.
                    </p>
                    <p className="text-xs text-muted-foreground">Items come from project tasks. The account manager adds them on the project.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Link href="/campaigns/clients" className="text-sm font-medium underline">
                        By client
                    </Link>
                </div>
            </div>

            {/* Add form, folded until the button above opens it */}
            <NewSection open={openNew === "1"} title="New campaign">
                <form action={createCampaignAction} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label className="text-sm">Name</Label>
                            <Input
                                name="name"
                                required
                                placeholder="e.g. Q2 Lead Gen — Meta"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Client</Label>
                            <Input
                                name="clientName"
                                list="clients-datalist"
                                required
                                defaultValue="Nexov"
                                placeholder="Nexov for in-house"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Project (optional)</Label>
                            <Select name="contractId" defaultValue={"none"}>
                                <SelectTrigger className="h-10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">— none —</SelectItem>
                                    {openContracts.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.clientName} · {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Platform</Label>
                            <Select name="platform" defaultValue="meta">
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
                            <Select name="objective" defaultValue="leads">
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
                            <Label className="text-sm">Start date</Label>
                            <Input
                                name="startDate"
                                type="date"
                                defaultValue={today}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">End date (optional)</Label>
                            <Input name="endDate" type="date" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Monthly budget (MYR)</Label>
                            <Input
                                name="monthlyBudgetMyr"
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue="0"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Fee model</Label>
                            <Select name="feeModel" defaultValue="none">
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
                                min="0"
                                step="0.01"
                                defaultValue="0"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Percent fee (% of spend)</Label>
                            <Input
                                name="percentFee"
                                type="number"
                                min="0"
                                step="0.1"
                                defaultValue="0"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">External ID (optional)</Label>
                            <Input
                                name="externalId"
                                placeholder="Meta campaign id (for future API sync)"
                            />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                            <Label className="text-sm">Landing URL</Label>
                            <Input name="landingUrl" type="url" placeholder="https://" />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button type="submit">Add campaign</Button>
                    </div>
                </form>
            </NewSection>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
                <SelectNav
                    label="Client"
                    value={clientFilter}
                    options={[
                        { value: "", label: "All", href: "/campaigns" },
                        ...clientNames.map((name) => ({
                            value: name,
                            label: name,
                            href: `/campaigns?client=${encodeURIComponent(name)}`,
                        })),
                    ]}
                />
            </div>

            {/* Lifetime KPIs */}
            <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border bg-card p-4">
                    <p className="text-xs text-muted-foreground">Active</p>
                    <p className="mt-1 text-lg font-semibold">
                        {campaigns.filter((c) => c.status === "live").length}
                    </p>
                </div>
                <div className="rounded-lg border bg-card p-4">
                    <p className="text-xs text-muted-foreground">Lifetime spend</p>
                    <p className="mt-1 text-lg font-semibold">
                        {fmtMyrShort(lifetime.spend)}
                    </p>
                </div>
                <div className="rounded-lg border bg-card p-4">
                    <p className="text-xs text-muted-foreground">
                        Platform leads
                    </p>
                    <p className="mt-1 text-lg font-semibold">{lifetime.leads}</p>
                </div>
                <div className="rounded-lg border bg-card p-4">
                    <p className="text-xs text-muted-foreground">Leads in CRM</p>
                    <p className="mt-1 text-lg font-semibold">{crmAttributed}</p>
                </div>
            </div>

            {/* List */}
            <div className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">
                    Campaigns ({campaigns.length})
                </div>
                {campaigns.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        No campaigns yet.
                    </p>
                ) : (
                    <ul className="divide-y">
                        {campaigns.map((c) => {
                            const t = totalsFor(c.metrics);
                            const crm = leads.filter(
                                (l) => l.sourceCampaignId === c.id,
                            ).length;
                            const won = leads.filter(
                                (l) =>
                                    l.sourceCampaignId === c.id &&
                                    l.status === "won",
                            );
                            const wonRevenue = won.reduce(
                                (s, l) => s + l.estValueMyr,
                                0,
                            );
                            const cpl = crm > 0 ? t.spendMyr / crm : 0;
                            const roas =
                                t.spendMyr > 0 ? wonRevenue / t.spendMyr : 0;
                            return (
                                <li
                                    key={c.id}
                                    className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                                >
                                    <div className="min-w-0 flex-1">
                                        <Link
                                            href={`/campaigns/${c.id}`}
                                            className="font-medium hover:underline"
                                        >
                                            {c.name}
                                        </Link>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {c.clientName} · {c.platform} ·{" "}
                                            {c.objective} · spent{" "}
                                            {fmtMyr(t.spendMyr)} · {crm} CRM lead
                                            {crm === 1 ? "" : "s"}
                                            {crm > 0
                                                ? ` · CPL ${fmtMyr(cpl)}`
                                                : ""}
                                            {wonRevenue > 0
                                                ? ` · ROAS ${roas.toFixed(2)}x`
                                                : ""}
                                            {c.feeModel !== "none"
                                                ? ` · fee ${fmtMyr(computeManagementFee(c, t.spendMyr))}`
                                                : ""}
                                        </p>
                                    </div>
                                    <Badge variant={STATUS_VARIANT[c.status]}>
                                        {c.status}
                                    </Badge>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
