import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getActingMember } from "@/lib/auth";
import { canOpenClient } from "@/lib/scope";
import { CLIENT_STATUSES, getClientById } from "@/lib/data/clients";
import { listLeads } from "@/lib/data/leads";
import { listWorks } from "@/lib/data/works";
import { listContentPosts } from "@/lib/data/content";
import { computeTotals, listInvoices } from "@/lib/data/invoices";
import { listSubmissions } from "@/lib/data/onboarding";
import { listTeamMembers } from "@/lib/data/team";
import { listContracts } from "@/lib/data/contracts";
import { listCampaigns } from "@/lib/data/campaigns";
import { clientJobStatus, endsInDays, hasEnded, summarizeWorks, todayKey, worksFor } from "@/lib/contracts/helpers";
import { isOpen } from "@/lib/works/helpers";
import { ContractStatusBadge, JobBadge, cadenceLabel, fmtMyr } from "@/app/(admin)/projects/ui";
import { fmtMyrShort } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { deleteClientAction, updateClientAction } from "@/lib/clients/actions";
import { agoLabel } from "@/lib/dashboard/clients";
import { CheckInForm } from "./check-in-form";
import { ClientInviteForm } from "./client-invite-form";
import { ContentBulkList } from "./content-bulk-list";
import { RenewalSelect } from "./renewal-select";

export const dynamic = "force-dynamic";

function eq(a: string | undefined | null, b: string) {
    return (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
}

export default async function ClientDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ as?: string }>;
}) {
    const [{ id }, sp] = await Promise.all([params, searchParams]);
    const client = await getClientById(id);
    if (!client) notFound();

    const [leads, works, content, invoices, submissions, team, contracts, campaigns, member] =
        await Promise.all([
            listLeads(),
            listWorks(),
            listContentPosts(),
            listInvoices(),
            listSubmissions(),
            listTeamMembers(),
            listContracts(),
            listCampaigns(),
            getActingMember(sp.as),
        ]);
    // A user opens only the clients of the projects they are on.
    if (!canOpenClient(member, client, contracts, works)) redirect("/settings/clients");
    const today = todayKey();
    const job = clientJobStatus(client.name, contracts, today);
    const myContracts = contracts.filter((c) => eq(c.clientName, client.name));

    const myLeads = leads.filter((l) => eq(l.company, client.name));
    const openTasks = works.filter((w) => eq(w.clientName, client.name) && isOpen(w)).length;
    const myContent = content.filter((c) => eq(c.clientName, client.name));
    const myInvoices = invoices.filter((i) => eq(i.clientName, client.name));
    const mySubmissions = submissions.filter((s) =>
        eq(s.clientName, client.name),
    );

    const billed = myInvoices.reduce((sum, i) => sum + computeTotals(i).total, 0);
    const paid = myInvoices
        .filter((i) => i.status === "paid")
        .reduce((sum, i) => sum + computeTotals(i).total, 0);
    const openContent = myContent.filter(
        (c) => c.status !== "posted" && c.status !== "archived",
    ).length;

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/settings/clients"
                    className="text-xs text-muted-foreground hover:underline"
                >
                    Clients
                </Link>
                <div className="mt-1 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold md:text-3xl">
                        {client.name}
                        {client.internal ? <Badge variant="outline">internal</Badge> : null}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/projects?client=${encodeURIComponent(client.name)}`}>
                        <JobBadge job={job} />
                    </Link>
                    <Badge
                        variant={
                            client.status === "active"
                                ? "default"
                                : client.status === "churned"
                                    ? "destructive"
                                    : "outline"
                        }
                        className={client.status === "onboarding" ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400" : undefined}
                    >
                        {client.status}
                    </Badge>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">
                    Deal owner:{" "}
                    <span className={client.dealOwner ? "font-medium text-foreground" : ""}>
                        {client.dealOwner || "none"}
                    </span>
                    {client.website ? (
                        <>
                            {" · "}
                            <a
                                href={client.website}
                                target="_blank"
                                rel="noreferrer"
                                className="underline"
                            >
                                {client.website}
                            </a>
                        </>
                    ) : null}
                </p>
            </div>

            {/* Aggregate KPIs — internal clients (our own company) have no billing, so no money tile. */}
            <div className={`grid gap-3 ${client.internal ? "md:grid-cols-4" : "md:grid-cols-5"}`}>
                {[
                    {
                        label: "Contract",
                        value: job.label,
                        href: `/projects?client=${encodeURIComponent(client.name)}`,
                    },
                    {
                        label: "Leads",
                        value: String(myLeads.length),
                        href: "/leads",
                    },
                    {
                        label: "Open tasks",
                        value: String(openTasks),
                        href: `/works?client=${encodeURIComponent(client.name)}`,
                    },
                    {
                        label: "Open content",
                        value: String(openContent),
                        href: `/static-posts?client=${encodeURIComponent(client.name)}`,
                    },
                    ...(client.internal
                        ? []
                        : [
                              {
                                  label: "Paid / Billed",
                                  value: `${fmtMyrShort(paid)} / ${fmtMyrShort(billed)}`,
                                  href: "/invoices",
                              },
                          ]),
                ].map((k) => (
                    <Link
                        href={k.href}
                        key={k.label}
                        className="rounded-lg border bg-card p-4 hover:bg-accent"
                    >
                        <p className="text-xs text-muted-foreground">{k.label}</p>
                        <p className="mt-1 text-lg font-semibold">{k.value}</p>
                    </Link>
                ))}
            </div>

            {/* Last check-in — the relationship pulse the Clients tab reads; our own company has none. */}
            {!client.internal ? (
                <section className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
                    <div>
                        <h2 className="text-sm font-medium">Last check-in</h2>
                        {client.lastCheckInAt ? (
                            <>
                                <p className="mt-1 text-sm tabular-nums">
                                    {client.lastCheckInAt}
                                    <span className="text-xs text-muted-foreground"> · {agoLabel(client.lastCheckInAt, today)}</span>
                                </p>
                                {client.lastCheckInNote ? <p className="text-xs text-muted-foreground">{client.lastCheckInNote}</p> : null}
                            </>
                        ) : (
                            <p className="mt-1 text-sm text-muted-foreground">No check-in logged.</p>
                        )}
                    </div>
                    <CheckInForm clientId={client.id} today={today} />
                </section>
            ) : null}

            {/* Edit form */}
            <form
                action={updateClientAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <input type="hidden" name="id" value={client.id} />
                <h2 className="text-sm font-medium">Profile</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Name</Label>
                        <Input name="name" defaultValue={client.name} required />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Status</Label>
                        <Select name="status" defaultValue={client.status}>
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
                        <Label className="text-sm">Deal owner</Label>
                        <Select
                            name="dealOwner"
                            defaultValue={client.dealOwner || "none"}
                        >
                            <SelectTrigger className="h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">— none —</SelectItem>
                                {team
                                    .filter((m) => m.active)
                                    .map((m) => (
                                        <SelectItem key={m.id} value={m.name}>
                                            {m.name} ({m.role})
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            Who closed the deal. Each project has its own account manager.
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Contact name</Label>
                        <Input
                            name="contactName"
                            defaultValue={client.contactName}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Contact email</Label>
                        <Input
                            name="contactEmail"
                            type="email"
                            defaultValue={client.contactEmail}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Phone</Label>
                        <Input
                            name="contactPhone"
                            type="tel"
                            defaultValue={client.contactPhone}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Industry</Label>
                        <Input
                            name="industry"
                            defaultValue={client.industry}
                        />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-sm">Website</Label>
                        <Input
                            name="website"
                            type="url"
                            defaultValue={client.website}
                        />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-sm">Billing address</Label>
                        <Textarea
                            name="billingAddress"
                            defaultValue={client.billingAddress}
                            rows={3}
                            placeholder={"Company Sdn Bhd\nJalan …, 50480 Kuala Lumpur"}
                        />
                        <p className="text-xs text-muted-foreground">
                            Auto-fills &quot;Bill to&quot; on every new invoice
                            and quote for this client.
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Revision limit</Label>
                        <Input
                            name="contentRevisionLimit"
                            type="number"
                            min={0}
                            defaultValue={client.contentRevisionLimit}
                        />
                        <p className="text-xs text-muted-foreground">
                            Feedback rounds the client gets per content item; what they are owed lives on their projects.
                        </p>
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Internal notes</Label>
                    <Textarea name="notes" defaultValue={client.notes} rows={4} />
                </div>
                {client.internal ? (
                    <p className="text-xs text-muted-foreground">
                        Our own company: internal projects, no contract and no billing.
                    </p>
                ) : null}
                <div className="flex justify-end">
                    <Button type="submit">Save</Button>
                </div>
            </form>

            {/* Client portal */}
            <section className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
                <div>
                    <h2 className="text-sm font-medium">Client portal</h2>
                    <p className="text-xs text-muted-foreground">
                        Where the client reviews content and approves tasks.
                    </p>
                </div>

                <ClientInviteForm
                    clientId={client.id}
                    defaultEmail={client.contactEmail}
                    linked={Boolean(client.userId)}
                />
            </section>

            {/* Aggregated lists */}
            {mySubmissions.length > 0 ? (
                <Section title={`Onboarding forms (${mySubmissions.length})`}>
                    {mySubmissions.map((s) => (
                        <li
                            key={s.id}
                            className="flex items-center justify-between p-3"
                        >
                            <Link
                                href={`/onboarding/${s.id}`}
                                className="hover:underline"
                            >
                                {s.checklistSlug}
                            </Link>
                            <Badge variant="secondary">{s.status}</Badge>
                        </li>
                    ))}
                </Section>
            ) : null}

            <Section title={`Projects (${myContracts.length})`}>
                {myContracts.map((c) => {
                    const w = summarizeWorks(worksFor(c, { works, content, campaigns }), today);
                    const days = endsInDays(c, today);
                    return (
                        <li key={c.id} className="flex flex-col gap-1 p-3 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <Link href={`/projects/${c.id}`} className="hover:underline">
                                        {c.name}
                                    </Link>
                                    <span className="text-xs text-muted-foreground">{c.code}</span>
                                    <ContractStatusBadge status={c.status} />
                                    {c.status === "active" && !c.signedAt ? <Badge variant="destructive">unsigned</Badge> : null}
                                    {hasEnded(c, today) ? <Badge variant="destructive">ended {c.endDate}</Badge> : null}
                                    {days !== null && days <= 30 ? (
                                        <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
                                            ends in {days}d
                                        </Badge>
                                    ) : null}
                                </div>
                                <p className="text-xs text-muted-foreground tabular-nums">
                                    {c.startDate}
                                    {c.endDate ? ` → ${c.endDate}` : " → rolling"} · {cadenceLabel(c.billing.cadence)}
                                    {c.billing.amountMyr ? ` ${fmtMyr(c.billing.amountMyr)}` : ""}
                                    {c.valueMyr ? ` · value ${fmtMyr(c.valueMyr)}` : ""} ·{" "}
                                    <Link href={`/projects/${c.id}#works`} className="hover:underline">
                                        {w.tasks} task{w.tasks === 1 ? "" : "s"}
                                    </Link>{" "}
                                    · {w.tasksDone} done
                                    {w.overdueTasks ? (
                                        <span className="font-medium text-red-600 dark:text-red-400"> · {w.overdueTasks} overdue</span>
                                    ) : null}{" "}
                                    · {w.content} content · {w.campaigns} campaign
                                    {w.campaigns === 1 ? "" : "s"}
                                </p>
                            </div>
                            {/* A fixed-term active project asks where its renewal stands. */}
                            {!client.internal && c.status === "active" && c.endDate ? <RenewalSelect contractId={c.id} value={c.renewalStatus} /> : null}
                        </li>
                    );
                })}
                <li className="p-3">
                    <Link
                        href={`/projects/new?client=${encodeURIComponent(client.name)}`}
                        className="text-xs font-medium underline"
                    >
                        + New project
                    </Link>
                    {myContracts.length === 0 ? (
                        <span className="ml-2 text-xs text-muted-foreground">No project yet — nothing is promised to this client.</span>
                    ) : null}
                </li>
            </Section>

            {myInvoices.length > 0 ? (
                <Section title={`Invoices (${myInvoices.length})`}>
                    {myInvoices.map((i) => {
                        const t = computeTotals(i);
                        return (
                            <li
                                key={i.id}
                                className="flex items-center justify-between p-3"
                            >
                                <Link
                                    href={`/invoices/${i.id}`}
                                    className="hover:underline"
                                >
                                    {i.number}{" "}
                                    <span className="text-muted-foreground">
                                        · due {i.dueDate}
                                    </span>
                                </Link>
                                <div className="flex items-center gap-3">
                                    <span>{fmtMyr(t.total)}</span>
                                    <Badge variant="secondary">{i.status}</Badge>
                                </div>
                            </li>
                        );
                    })}
                </Section>
            ) : null}

            {myLeads.length > 0 ? (
                <Section title={`Leads (${myLeads.length})`}>
                    {myLeads.map((l) => (
                        <li
                            key={l.id}
                            className="flex items-center justify-between p-3"
                        >
                            <Link
                                href={`/leads/${l.id}`}
                                className="hover:underline"
                            >
                                {l.name}
                            </Link>
                            <Badge variant="outline">{l.status}</Badge>
                        </li>
                    ))}
                </Section>
            ) : null}

            {myContent.length > 0 ? (
                <ContentBulkList
                    clientId={client.id}
                    items={myContent.map((c) => ({
                        id: c.id,
                        title: c.title,
                        scheduledFor: c.scheduledFor,
                        status: c.status,
                    }))}
                />
            ) : null}

            {/* Delete */}
            <form
                action={deleteClientAction}
                className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"
            >
                <input type="hidden" name="id" value={client.id} />
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="text-sm font-medium text-destructive">
                            Delete client profile
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Removes this record only; leads, projects, tasks and invoices keep the name.
                        </p>
                    </div>
                    <Button type="submit" variant="destructive">
                        Delete
                    </Button>
                </div>
            </form>
        </div>
    );
}

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="rounded-lg border bg-card">
            <div className="border-b p-3 text-sm font-medium">{title}</div>
            <ul className="divide-y text-sm">{children}</ul>
        </section>
    );
}
