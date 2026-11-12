/**
 * Client tab: who the project is for — contact, billing address, status, the
 * deal owner (who closed the deal) next to this project's account manager,
 * the client's other projects — and the way to the full client record.
 * Read-only here; the record is edited under Clients.
 */
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { progress } from "@/lib/works/helpers";
import { cn } from "@/lib/utils";
import { fmtMyrShort } from "@/lib/format";
import { StageBadge } from "../../ui";
import { CARD, type ContractView } from "../shared";

const STATUS_CLASS: Record<string, string> = {
    active: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    onboarding: "border-transparent bg-violet-500/15 text-violet-700 dark:text-violet-400",
    prospect: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
    paused: "border-transparent bg-muted text-muted-foreground",
    churned: "border-transparent bg-red-500/15 text-red-700 dark:text-red-400",
};

export function ClientTab({ v }: { v: ContractView }) {
    const { c, client, clientContracts, allWorks, asQ } = v;

    if (!client) {
        return (
            <section className={CARD}>
                <h2 className="text-sm font-medium">Client</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    No client record is named <span className="font-medium text-foreground">{c.clientName}</span>; contact details and
                    billing live on the client record.{" "}
                    <Link href="/settings/clients" className="underline">
                        Add it under Clients
                    </Link>
                    .
                </p>
            </section>
        );
    }

    return (
        <>
            <section className="grid gap-4 lg:grid-cols-2">
                <div className={CARD}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-sm font-medium">{client.name}</h2>
                        <Badge variant="outline" className={cn(STATUS_CLASS[client.status])}>
                            {client.status}
                        </Badge>
                    </div>
                    <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                        <div>
                            <dt className="text-xs text-muted-foreground">Contact person</dt>
                            <dd className="font-medium">{client.contactName || "—"}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Email</dt>
                            <dd className="font-medium">
                                {client.contactEmail ? (
                                    <a href={`mailto:${client.contactEmail}`} className="underline">
                                        {client.contactEmail}
                                    </a>
                                ) : (
                                    "—"
                                )}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Phone</dt>
                            <dd className="font-medium">
                                {client.contactPhone ? (
                                    <a href={`tel:${client.contactPhone}`} className="underline">
                                        {client.contactPhone}
                                    </a>
                                ) : (
                                    "—"
                                )}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Website</dt>
                            <dd className="font-medium">
                                {client.website ? (
                                    <a href={client.website} target="_blank" rel="noreferrer" className="underline">
                                        {client.website}
                                    </a>
                                ) : (
                                    "—"
                                )}
                            </dd>
                        </div>
                        <div className="sm:col-span-2">
                            <dt className="text-xs text-muted-foreground">Billing address</dt>
                            <dd className="whitespace-pre-line font-medium">{client.billingAddress || "—"}</dd>
                        </div>
                        {client.industry ? (
                            <div>
                                <dt className="text-xs text-muted-foreground">Industry</dt>
                                <dd className="font-medium">{client.industry}</dd>
                            </div>
                        ) : null}
                    </dl>
                    <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3">
                        <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/settings/clients/${client.id}`} />}>
                            Open full client record
                        </Button>
                        <span className="text-xs text-muted-foreground">Contact, billing, portal and notes are edited there.</span>
                    </div>
                </div>

                <div className={CARD}>
                    <h2 className="text-sm font-medium">Account</h2>
                    <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                        <div>
                            <dt className="text-xs text-muted-foreground">Deal owner</dt>
                            <dd className="font-medium">{client.dealOwner || "—"}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Account manager on this account</dt>
                            <dd className="font-medium">{c.accountManager || "—"}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Status</dt>
                            <dd className="font-medium">{client.status}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Client since</dt>
                            <dd className="font-medium tabular-nums">{client.createdAt.slice(0, 10)}</dd>
                        </div>
                    </dl>
                    {client.notes ? <p className="mt-3 whitespace-pre-line border-t pt-3 text-sm text-muted-foreground">{client.notes}</p> : null}
                </div>
            </section>

            <section className={CARD}>
                <h2 className="text-sm font-medium">
                    Other accounts with {client.name} <span className="tabular-nums text-muted-foreground">· {clientContracts.length}</span>
                </h2>
                {clientContracts.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">This is the only account on file for this client.</p>
                ) : (
                    <ul className="mt-2 divide-y text-sm">
                        {clientContracts.map((x) => {
                            const tp = progress(allWorks.filter((w) => w.contractId === x.id));
                            return (
                                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                    <div className="min-w-0">
                                        <Link href={`/projects/${x.id}${asQ}`} className="font-medium hover:underline">
                                            {x.name}
                                        </Link>
                                        <p className="text-xs tabular-nums text-muted-foreground">
                                            {x.code} · {x.startDate || "—"}
                                            {x.endDate ? ` → ${x.endDate}` : " → open-ended"}
                                            {x.valueMyr ? ` · ${fmtMyrShort(x.valueMyr)}` : ""}
                                            {x.accountManager ? ` · AM ${x.accountManager}` : ""}
                                            {tp.total ? ` · ${tp.done}/${tp.total} tasks done` : " · no tasks"}
                                        </p>
                                    </div>
                                    <StageBadge stage={x.stage} status={x.status} internal={v.internal} />
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </>
    );
}
