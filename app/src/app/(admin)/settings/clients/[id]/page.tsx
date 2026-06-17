import Link from "next/link";
import { notFound } from "next/navigation";
import { CLIENT_STATUSES, getClientById } from "@/lib/data/clients";
import { listLeads } from "@/lib/data/leads";
import { listProjects } from "@/lib/data/projects";
import { listContentPosts } from "@/lib/data/content";
import { computeTotals, listInvoices } from "@/lib/data/invoices";
import { listSubmissions } from "@/lib/data/onboarding";
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
import {
    deleteClientAction,
    generateContentPlanAction,
    updateClientAction,
} from "@/lib/clients/actions";
import { ClientInviteForm } from "./client-invite-form";

export const dynamic = "force-dynamic";

/** Current month as 'YYYY-MM' for the plan-generation default. */
function currentMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function eq(a: string | undefined | null, b: string) {
    return (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
}

export default async function ClientDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const client = await getClientById(id);
    if (!client) notFound();

    const [leads, projects, content, invoices, submissions] = await Promise.all(
        [
            listLeads(),
            listProjects(),
            listContentPosts(),
            listInvoices(),
            listSubmissions(),
        ],
    );

    const myLeads = leads.filter((l) => eq(l.company, client.name));
    const myProjects = projects.filter((p) => eq(p.clientName, client.name));
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

    const thisMonth = currentMonth();
    const planThisMonth = myContent.filter(
        (c) => c.origin === "plan" && c.planMonth === thisMonth,
    );

    const fmt = (n: number) =>
        n.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

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
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        {client.name}
                    </h1>
                    <Badge
                        variant={
                            client.status === "active"
                                ? "default"
                                : client.status === "churned"
                                    ? "destructive"
                                    : "outline"
                        }
                    >
                        {client.status}
                    </Badge>
                </div>
                {client.website ? (
                    <a
                        href={client.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground underline"
                    >
                        {client.website}
                    </a>
                ) : null}
            </div>

            {/* Aggregate KPIs */}
            <div className="grid gap-3 md:grid-cols-4">
                {[
                    {
                        label: "Leads",
                        value: String(myLeads.length),
                        href: "/leads",
                    },
                    {
                        label: "Projects",
                        value: String(myProjects.length),
                        href: "/projects",
                    },
                    {
                        label: "Open content",
                        value: String(openContent),
                        href: "/content",
                    },
                    {
                        label: "Paid / Billed",
                        value: `MYR ${fmt(paid)} / ${fmt(billed)}`,
                        href: "/invoices",
                    },
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
                    <div className="space-y-1.5">
                        <Label className="text-sm">
                            Monthly content quota
                        </Label>
                        <Input
                            name="monthlyContentQuota"
                            type="number"
                            min={0}
                            defaultValue={client.monthlyContentQuota}
                        />
                        <p className="text-xs text-muted-foreground">
                            Content items the retainer covers per month.
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
                            Feedback cycles allowed per content item.
                        </p>
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Internal notes</Label>
                    <Textarea name="notes" defaultValue={client.notes} rows={4} />
                </div>
                <div className="flex justify-end">
                    <Button type="submit">Save</Button>
                </div>
            </form>

            {/* Content plan & client portal */}
            <section className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
                <div>
                    <h2 className="text-sm font-medium">
                        Content plan & portal
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        Generate this client&apos;s monthly content from their
                        quota, and issue a portal link for review.
                    </p>
                </div>

                {/* Generate this month's plan */}
                <form
                    action={generateContentPlanAction}
                    className="flex flex-col gap-3 sm:flex-row sm:items-end"
                >
                    <input type="hidden" name="id" value={client.id} />
                    <div className="space-y-1.5">
                        <Label className="text-sm">Plan month</Label>
                        <Input
                            name="month"
                            type="month"
                            defaultValue={thisMonth}
                            className="w-44"
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={client.monthlyContentQuota <= 0}
                    >
                        Generate plan ({client.monthlyContentQuota})
                    </Button>
                    <p className="text-xs text-muted-foreground sm:pb-2">
                        {planThisMonth.length > 0
                            ? `${planThisMonth.length} planned item(s) for ${thisMonth}.`
                            : client.monthlyContentQuota <= 0
                                ? "Set a monthly quota above first."
                                : "No plan generated for this month yet."}
                    </p>
                </form>

                {/* Portal login */}
                <ClientInviteForm
                    clientId={client.id}
                    defaultEmail={client.contactEmail}
                    linked={Boolean(client.userId)}
                />
            </section>

            {/* Aggregated lists */}
            {mySubmissions.length > 0 ? (
                <Section title={`Onboarding (${mySubmissions.length})`}>
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

            {myProjects.length > 0 ? (
                <Section title={`Projects (${myProjects.length})`}>
                    {myProjects.map((p) => (
                        <li
                            key={p.id}
                            className="flex items-center justify-between p-3"
                        >
                            <Link
                                href={`/projects/${p.id}`}
                                className="hover:underline"
                            >
                                {p.name}
                            </Link>
                            <Badge variant="secondary">
                                {p.status.replace(/_/g, " ")}
                            </Badge>
                        </li>
                    ))}
                </Section>
            ) : null}

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
                                    <span>MYR {fmt(t.total)}</span>
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
                <Section title={`Content (${myContent.length})`}>
                    {myContent.slice(0, 10).map((c) => (
                        <li
                            key={c.id}
                            className="flex items-center justify-between p-3"
                        >
                            <Link
                                href={`/content/${c.id}`}
                                className="hover:underline"
                            >
                                {c.title}{" "}
                                <span className="text-muted-foreground">
                                    · {c.scheduledFor}
                                </span>
                            </Link>
                            <Badge variant="secondary">{c.status}</Badge>
                        </li>
                    ))}
                </Section>
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
                            Removes this directory entry only. Leads / projects /
                            invoices keep the name string.
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
