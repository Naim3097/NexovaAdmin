import Link from "next/link";
import {
    LEAD_SOURCES,
    LEAD_STATUSES,
    listLeads,
    type LeadStatus,
} from "@/lib/data/leads";
import { listCampaigns } from "@/lib/data/campaigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createLeadAction } from "@/lib/leads/actions";
import { fmtMyrWhole } from "@/lib/format";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { NewButton, NewSection, newFormHref } from "@/components/new-button";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<LeadStatus, "default" | "secondary" | "destructive" | "outline"> = {
    new: "secondary",
    contacted: "outline",
    qualified: "outline",
    proposal: "default",
    won: "default",
    lost: "destructive",
};

/** What each stage is called on screen; the stored value stays as is. */
const STATUS_LABEL: Record<LeadStatus, string> = {
    new: "New",
    contacted: "Contacted",
    qualified: "Qualified",
    proposal: "Quoted",
    won: "Won",
    lost: "Lost",
};

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ as?: string; new?: string }> }) {
    const sp = await searchParams;
    const [leads, campaigns] = await Promise.all([
        listLeads(),
        listCampaigns(),
    ]);
    const attributable = campaigns.filter(
        (c) => c.status === "live" || c.status === "paused",
    );
    const newHref = newFormHref("/leads", { as: sp.as });
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">Leads</h1>
                    <p className="text-sm text-muted-foreground">
                        Track new interest and turn it into contracts.
                    </p>
                </div>
                <NewButton href={newHref}>+ New lead</NewButton>
            </div>

            {/* Add form, folded until the button above opens it */}
            <NewSection open={sp.new === "1"} title="New lead">
                <form action={createLeadAction} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label className="text-sm">Name</Label>
                            <Input name="name" required placeholder="Contact name" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Company</Label>
                            <Input name="company" list="clients-datalist" placeholder="e.g. Lean.x Sdn Bhd" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Email</Label>
                            <Input name="email" type="email" inputMode="email" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Phone</Label>
                            <Input name="phone" type="tel" inputMode="tel" placeholder="+60..." />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Source</Label>
                            <Select name="source" defaultValue="other">
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
                            <Input name="estValueMyr" type="number" min={0} step={100} defaultValue={0} />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                            <Label className="text-sm">Source campaign (optional)</Label>
                            <Select name="sourceCampaignId" defaultValue="none">
                                <SelectTrigger className="h-10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">— none —</SelectItem>
                                    {attributable.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.name} ({c.platform})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Interested in</Label>
                        <Input name="interestedIn" placeholder="Website, META Ads, …" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Notes</Label>
                        <Textarea name="notes" rows={2} placeholder="Anything useful for the closer." />
                    </div>
                    <div className="flex justify-end">
                        <Button type="submit">Add lead</Button>
                    </div>
                </form>
            </NewSection>

            {/* List */}
            <div className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">
                    All leads ({leads.length})
                </div>
                {leads.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        No leads yet.{" "}
                        <Link href={newHref} className="underline">
                            Add the first one
                        </Link>
                        .
                    </p>
                ) : (
                    <ul className="divide-y">
                        {leads.map((l) => {
                            const band =
                                l.score >= 70
                                    ? "hot"
                                    : l.score >= 40
                                        ? "warm"
                                        : "cold";
                            const bandTone:
                                | "default"
                                | "secondary"
                                | "outline" =
                                band === "hot"
                                    ? "default"
                                    : band === "warm"
                                        ? "secondary"
                                        : "outline";
                            return (
                                <li
                                    key={l.id}
                                    className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                                >
                                    <div className="min-w-0 flex-1">
                                        <Link
                                            href={`/leads/${l.id}`}
                                            className="font-medium hover:underline"
                                        >
                                            {l.name}
                                            {l.company ? (
                                                <span className="text-muted-foreground"> · {l.company}</span>
                                            ) : null}
                                        </Link>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {l.interestedIn || "—"} · {l.source.replace(/_/g, " ")}
                                            {l.estValueMyr > 0
                                                ? ` · ${fmtMyrWhole(l.estValueMyr)}`
                                                : ""}
                                            {l.assignedTo
                                                ? ` · @${l.assignedTo}`
                                                : " · no owner"}
                                        </p>
                                    </div>
                                    {/* Fixed 3-column meta grid so every row lines
                                        up: icon slot (kept even without a phone),
                                        band chip, then ONE last chip — neon New for
                                        untouched auto leads, status otherwise. */}
                                    <div className="flex items-center gap-2">
                                        <span className="flex w-9 shrink-0 justify-center">
                                            <WhatsAppButton phone={l.phone} name={l.name} />
                                        </span>
                                        <Badge
                                            variant={bandTone}
                                            className="w-[84px] justify-center tabular-nums"
                                        >
                                            {band} · {l.score}
                                        </Badge>
                                        {l.autoIntake ? (
                                            <Badge className="w-[84px] justify-center border-transparent bg-[#39FF14] text-black shadow-[0_0_8px_rgba(57,255,20,0.55)]">
                                                New
                                            </Badge>
                                        ) : (
                                            <Badge
                                                variant={STATUS_VARIANT[l.status]}
                                                className="w-[84px] justify-center"
                                            >
                                                {STATUS_LABEL[l.status]}
                                            </Badge>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
                <div className="border-t p-3 text-xs text-muted-foreground">
                    Stages: {LEAD_STATUSES.map((s) => STATUS_LABEL[s]).join(" → ")}
                </div>
            </div>
        </div>
    );
}
