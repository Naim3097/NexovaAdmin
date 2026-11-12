import Link from "next/link";
import { CLIENT_STATUSES, listClients } from "@/lib/data/clients";
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
import { createClientAction } from "@/lib/clients/actions";
import { listContracts } from "@/lib/data/contracts";
import { computeTotals, listInvoices } from "@/lib/data/invoices";
import { listWorks } from "@/lib/data/works";
import { getActingMember } from "@/lib/auth";
import { seesEverything, visibleClients } from "@/lib/scope";
import { clientJobStatus, todayKey } from "@/lib/contracts/helpers";
import { JobBadge } from "@/app/(admin)/projects/ui";
import { NewButton, NewSection, newFormHref } from "@/components/new-button";

export const dynamic = "force-dynamic";

export default async function SettingsClientsPage({ searchParams }: { searchParams: Promise<{ as?: string; new?: string }> }) {
    const sp = await searchParams;
    const [allClients, contracts, invoices, works, member] = await Promise.all([
        listClients(),
        listContracts(),
        listInvoices(),
        listWorks(),
        getActingMember(sp.as),
    ]);
    // A user sees only the clients of the projects they are on; managers (or nobody picked) see all.
    const clients = visibleClients(member, allClients, contracts, works);
    const scoped = !seesEverything(member);
    const today = todayKey();
    const newHref = newFormHref("/settings/clients", { as: sp.as });
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <Link
                        href="/settings"
                        className="text-xs text-muted-foreground hover:underline"
                    >
                        Settings
                    </Link>
                    <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Clients</h1>
                    <p className="text-sm text-muted-foreground">
                        {clients.length} record{clients.length === 1 ? "" : "s"}
                        {scoped ? " — the clients of the accounts you are on" : ""}; the badge says whether we have a signed contract with them — see{" "}
                        <Link href="/projects" className="underline">
                            Accounts
                        </Link>
                        .
                    </p>
                </div>
                <NewButton href={newHref}>+ New client</NewButton>
            </div>

            {/* Add form, folded until the button above opens it */}
            <NewSection open={sp.new === "1"} title="New client">
                <form action={createClientAction} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label className="text-sm">Name</Label>
                            <Input name="name" required placeholder="Lean.x Sdn Bhd" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Status</Label>
                            <Select name="status" defaultValue="prospect">
                                <SelectTrigger className="h-10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CLIENT_STATUSES.map((s) => (
                                        <SelectItem key={s} value={s}>
                                            {s}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Contact name</Label>
                            <Input name="contactName" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Contact email</Label>
                            <Input name="contactEmail" type="email" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Phone</Label>
                            <Input name="contactPhone" type="tel" placeholder="+60..." />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Industry</Label>
                            <Input name="industry" placeholder="F&B, SaaS, ..." />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                            <Label className="text-sm">Website</Label>
                            <Input name="website" type="url" placeholder="https://" />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button type="submit">Add client</Button>
                    </div>
                </form>
            </NewSection>

            <div className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">Directory</div>
                {clients.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        {scoped ? "No clients assigned to you yet." : "No clients yet."}
                    </p>
                ) : (
                    <ul className="divide-y">
                        {clients.map((c) => (
                            <li
                                key={c.id}
                                className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Link
                                            href={`/settings/clients/${c.id}`}
                                            className="font-medium hover:underline"
                                        >
                                            {c.name}
                                        </Link>
                                        {c.internal ? <Badge variant="outline">internal</Badge> : null}
                                    </div>
                                    <p className="truncate text-xs text-muted-foreground">
                                        Deal owner: {c.dealOwner || "none"}
                                        {c.contactName ? ` · ${c.contactName}` : ""}
                                        {c.contactEmail ? ` · ${c.contactEmail}` : ""}
                                    </p>
                                    {(() => {
                                        const my = contracts.filter((x) => x.clientName === c.name && x.status !== "cancelled");
                                        const paid = invoices
                                            .filter((i) => i.clientName === c.name && i.status === "paid")
                                            .reduce((s, i) => s + computeTotals(i).total, 0);
                                        return (
                                            <p className="text-xs text-muted-foreground tabular-nums">
                                                {my.length} account{my.length === 1 ? "" : "s"} · {my.filter((x) => x.signedAt).length} signed ·{" "}
                                                {my.filter((x) => x.status === "active").length} active{c.internal ? " · internal, no billing" : ` · paid RM ${Math.round(paid).toLocaleString("en-MY")} to date`}
                                            </p>
                                        );
                                    })()}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {c.status !== "churned" ? (
                                        <Link href={`/projects?client=${encodeURIComponent(c.name)}`}>
                                            <JobBadge job={clientJobStatus(c.name, contracts, today)} />
                                        </Link>
                                    ) : null}
                                    <Badge
                                        variant={
                                            c.status === "active"
                                                ? "default"
                                                : c.status === "churned"
                                                    ? "destructive"
                                                    : "outline"
                                        }
                                        className={c.status === "onboarding" ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400" : undefined}
                                    >
                                        {c.status}
                                    </Badge>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
