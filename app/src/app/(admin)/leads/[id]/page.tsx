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
import {
    convertLeadToOnboardingAction,
    deleteLeadAction,
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
                    <div className="flex items-center gap-2">
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
                    <Label className="text-sm">Notes</Label>
                    <Textarea name="notes" defaultValue={lead.notes} rows={3} />
                </div>
                <div className="flex justify-end">
                    <Button type="submit">Save changes</Button>
                </div>
            </form>

            {/* Convert + delete */}
            <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-center md:justify-between md:p-6">
                <div>
                    <h2 className="text-sm font-medium">Actions</h2>
                    <p className="text-xs text-muted-foreground">
                        {lead.onboardingSubmissionId
                            ? "Already converted to onboarding."
                            : "Convert this lead into an onboarding submission and mark as won."}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <form action={promoteLeadToClientAction}>
                        <input type="hidden" name="id" value={lead.id} />
                        <Button type="submit" variant="outline">
                            Promote to client
                        </Button>
                    </form>
                    {lead.onboardingSubmissionId ? (
                        <Link
                            href={`/onboarding/${lead.onboardingSubmissionId}`}
                            className="text-sm underline"
                        >
                            Open onboarding
                        </Link>
                    ) : (
                        <form action={convertLeadToOnboardingAction}>
                            <input type="hidden" name="id" value={lead.id} />
                            <Button type="submit">Convert to onboarding</Button>
                        </form>
                    )}
                    <form action={deleteLeadAction}>
                        <input type="hidden" name="id" value={lead.id} />
                        <Button type="submit" variant="destructive">
                            Delete lead
                        </Button>
                    </form>
                </div>
            </section>

            <HistoryPanel entity="lead" entityId={lead.id} />

            <p className="text-xs text-muted-foreground">
                Created {new Date(lead.createdAt).toLocaleString()} · Last updated{" "}
                {new Date(lead.updatedAt).toLocaleString()}
            </p>
        </div>
    );
}
