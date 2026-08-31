import Link from "next/link";
import { notFound } from "next/navigation";
import {
    LEAD_SOURCES,
    LEAD_STATUSES,
    getLeadById,
} from "@/lib/data/leads";
import { listCampaigns } from "@/lib/data/campaigns";
import { listTeamMembers } from "@/lib/data/team";
import { scoreLead } from "@/lib/leads/scoring";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/save-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { HistoryPanel } from "@/components/history-panel";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { WhatsAppButton } from "@/components/whatsapp-button";
import {
    convertLeadToOnboardingAction,
    deleteLeadAction,
    createDepositInvoiceAction,
    promoteLeadToClientAction,
    rescoreLeadAction,
    setLeadAssigneeAction,
    setLeadStatusAction,
    updateLeadAction,
} from "@/lib/leads/actions";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const lead = await getLeadById(id);
    if (!lead) notFound();
    const [campaigns, team] = await Promise.all([
        listCampaigns(),
        listTeamMembers(),
    ]);
    const sourceCampaign = lead.sourceCampaignId
        ? campaigns.find((c) => c.id === lead.sourceCampaignId) ?? null
        : null;
    const breakdown = scoreLead(lead);
    const bandTone: "default" | "secondary" | "outline" =
        breakdown.band === "hot"
            ? "default"
            : breakdown.band === "warm"
                ? "secondary"
                : "outline";

    return (
        <div className="space-y-6">
            <div>
                <Link href="/leads" className="text-sm text-muted-foreground hover:underline">
                    Back to leads
                </Link>
                <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        {lead.name}
                        {lead.company ? (
                            <span className="text-muted-foreground"> · {lead.company}</span>
                        ) : null}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2">
                        <WhatsAppButton
                            phone={lead.phone}
                            name={lead.name}
                            label="WhatsApp"
                        />
                        <Badge variant={bandTone}>
                            {breakdown.band} · {breakdown.score}
                        </Badge>
                        <Badge variant="outline">{lead.status}</Badge>
                        {lead.assignedTo ? (
                            <Badge variant="secondary">
                                @{lead.assignedTo}
                            </Badge>
                        ) : (
                            <Badge variant="destructive">unassigned</Badge>
                        )}
                    </div>
                </div>
            </div>

            {/* Score + Assignee */}
            <section className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border bg-card p-4 md:p-6">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-sm font-medium">
                                Score breakdown
                            </h2>
                            <p className="text-xs text-muted-foreground">
                                Heuristics on source / value / contact /
                                intent. Re-runs on edit.
                            </p>
                        </div>
                        <form action={rescoreLeadAction}>
                            <input
                                type="hidden"
                                name="id"
                                value={lead.id}
                            />
                            <Button
                                type="submit"
                                size="sm"
                                variant="outline"
                            >
                                Re-score
                            </Button>
                        </form>
                    </div>
                    <div className="mt-4">
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-semibold">
                                {breakdown.score}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                / 100 · {breakdown.band}
                            </span>
                        </div>
                        {breakdown.factors.length === 0 ? (
                            <p className="mt-2 text-sm text-muted-foreground">
                                No scoring signals yet. Add value / contact /
                                interest details.
                            </p>
                        ) : (
                            <ul className="mt-3 space-y-1 text-sm">
                                {breakdown.factors.map((f) => (
                                    <li
                                        key={f.label}
                                        className="flex items-center justify-between gap-3 border-b py-1 last:border-b-0"
                                    >
                                        <span className="text-muted-foreground">
                                            {f.label}
                                        </span>
                                        <span className="font-medium">
                                            +{f.points}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <form
                    action={setLeadAssigneeAction}
                    className="rounded-lg border bg-card p-4 md:p-6"
                >
                    <input type="hidden" name="id" value={lead.id} />
                    <h2 className="text-sm font-medium">Assigned to</h2>
                    <p className="text-xs text-muted-foreground">
                        Closer-role members preferred; auto-assigned on
                        creation by load. Override here.
                    </p>
                    <div className="mt-4 flex items-end gap-2">
                        <div className="flex-1 space-y-1.5">
                            <Label className="text-sm">Owner</Label>
                            <Select
                                name="assignedTo"
                                defaultValue={lead.assignedTo || "none"}
                            >
                                <SelectTrigger className="h-10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">
                                        Unassigned
                                    </SelectItem>
                                    {team
                                        .filter((m) => m.active)
                                        .map((m) => (
                                            <SelectItem
                                                key={m.id}
                                                value={m.name}
                                            >
                                                {m.name} ({m.role})
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button type="submit">Save</Button>
                    </div>
                </form>
            </section>

            {/* Status changer */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">Move to status</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                    {LEAD_STATUSES.map((s) => (
                        <form key={s} action={setLeadStatusAction}>
                            <input type="hidden" name="id" value={lead.id} />
                            <input type="hidden" name="status" value={s} />
                            <Button
                                type="submit"
                                size="sm"
                                variant={lead.status === s ? "default" : "outline"}
                                disabled={lead.status === s}
                            >
                                {s}
                            </Button>
                        </form>
                    ))}
                </div>
            </section>

            {/* Edit form */}
            <form
                action={updateLeadAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <input type="hidden" name="id" value={lead.id} />
                <h2 className="text-sm font-medium">Details</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Name</Label>
                        <Input name="name" defaultValue={lead.name} required />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Company</Label>
                        <Input name="company" defaultValue={lead.company} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Email</Label>
                        <Input name="email" type="email" defaultValue={lead.email} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Phone</Label>
                        <Input name="phone" type="tel" defaultValue={lead.phone} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Source</Label>
                        <Select name="source" defaultValue={lead.source}>
                            <SelectTrigger className="h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {LEAD_SOURCES.map((s) => (
                                    <SelectItem key={s} value={s}>
                                        {s.replace(/_/g, " ")}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Estimated value (MYR)</Label>
                        <Input
                            name="estValueMyr"
                            type="number"
                            min={0}
                            step={100}
                            defaultValue={lead.estValueMyr}
                        />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-sm">Source campaign</Label>
                        <Select
                            name="sourceCampaignId"
                            defaultValue={lead.sourceCampaignId ?? "none"}
                        >
                            <SelectTrigger className="h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">— none —</SelectItem>
                                {campaigns.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.name} ({c.platform})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {sourceCampaign ? (
                            <p className="text-xs text-muted-foreground">
                                <Link
                                    href={`/campaigns/${sourceCampaign.id}`}
                                    className="underline"
                                >
                                    Open campaign
                                </Link>
                            </p>
                        ) : null}
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Interested in</Label>
                    <Input name="interestedIn" defaultValue={lead.interestedIn} />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Billing address</Label>
                    <Textarea
                        name="billingAddress"
                        defaultValue={lead.billingAddress}
                        rows={3}
                        placeholder={"Company Sdn Bhd\nJalan …, 50480 Kuala Lumpur"}
                    />
                    <p className="text-xs text-muted-foreground">
                        Fills &quot;Bill to&quot; on the deposit invoice and
                        follows them onto the client record when promoted.
                    </p>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Notes</Label>
                    <Textarea name="notes" defaultValue={lead.notes} rows={3} />
                </div>
                <div className="flex justify-end">
                    <SaveButton />
                </div>
            </form>

            {/* Closing the deal — the three steps in the order they happen. */}
            <section className="rounded-lg border bg-card">
                <div className="border-b p-4 md:px-6">
                    <h2 className="text-sm font-medium">Close the deal</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Three steps, in order. No work starts before the money
                        lands.
                    </p>
                </div>

                {/* 1 · Get paid first */}
                <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-end md:justify-between md:px-6">
                    <div className="max-w-sm">
                        <p className="text-sm font-medium">
                            <span className="mr-2 font-mono text-xs text-primary">1</span>
                            Get paid first
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            One-off work takes a 50% deposit. Retainers take
                            the full first payment.
                        </p>
                    </div>
                    <form
                        action={createDepositInvoiceAction}
                        className="flex flex-wrap items-end gap-2"
                    >
                        <input type="hidden" name="id" value={lead.id} />
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                                Upfront
                            </Label>
                            <select
                                name="pct"
                                defaultValue="50"
                                className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
                            >
                                <option value="50">50% deposit (one-off)</option>
                                <option value="100">100% full (retainer)</option>
                                <option value="30">30% deposit</option>
                                <option value="70">70% deposit</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                                Of amount (MYR)
                            </Label>
                            <Input
                                name="baseMyr"
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue={lead.estValueMyr || ""}
                                className="w-32"
                            />
                        </div>
                        <Button type="submit">Create invoice</Button>
                    </form>
                </div>

                {/* 2 · Make them a client */}
                <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between md:px-6">
                    <div className="max-w-sm">
                        <p className="text-sm font-medium">
                            <span className="mr-2 font-mono text-xs text-primary">2</span>
                            Make them a client
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Creates the client record (or links an existing
                            one) and marks this lead won.
                        </p>
                    </div>
                    <form action={promoteLeadToClientAction}>
                        <input type="hidden" name="id" value={lead.id} />
                        <Button type="submit" variant="outline">
                            Promote to client
                        </Button>
                    </form>
                </div>

                {/* 3 · Start onboarding */}
                <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:px-6">
                    <div className="max-w-sm">
                        <p className="text-sm font-medium">
                            <span className="mr-2 font-mono text-xs text-primary">3</span>
                            Start onboarding
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {lead.onboardingSubmissionId
                                ? "Onboarding form already created."
                                : "Creates the onboarding form to send the client."}
                        </p>
                    </div>
                    {lead.onboardingSubmissionId ? (
                        <Button
                            variant="outline"
                            render={
                                <Link
                                    href={`/onboarding/${lead.onboardingSubmissionId}`}
                                />
                            }
                        >
                            Open onboarding
                        </Button>
                    ) : (
                        <form action={convertLeadToOnboardingAction}>
                            <input type="hidden" name="id" value={lead.id} />
                            <Button type="submit" variant="outline">
                                Convert to onboarding
                            </Button>
                        </form>
                    )}
                </div>
            </section>

            {/* Danger zone — away from the workflow buttons. */}
            <section className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/[0.03] p-4 md:px-6">
                <div>
                    <h2 className="text-sm font-medium text-destructive">
                        Danger zone
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        Deleting removes this lead permanently.
                    </p>
                </div>
                <form action={deleteLeadAction}>
                    <input type="hidden" name="id" value={lead.id} />
                    <Button type="submit" variant="destructive">
                        Delete lead
                    </Button>
                </form>
            </section>

            <HistoryPanel entity="lead" entityId={lead.id} />

            <p className="text-xs text-muted-foreground">
                Created {new Date(lead.createdAt).toLocaleString()} · Last updated{" "}
                {new Date(lead.updatedAt).toLocaleString()}
            </p>
        </div>
    );
}
