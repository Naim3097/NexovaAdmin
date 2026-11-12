/**
 * Projects list. One row per project — everyone sees every project and
 * filters. Filters by stage, account manager and client are dropdowns and
 * live in the URL. New projects are written on /projects/new. Internal
 * projects (our own company's) carry an "internal" chip and no value.
 */
import Link from "next/link";
import { requireTeamAccess } from "@/lib/auth";
import { CONTRACT_STAGES, CONTRACT_STAGE_LABEL, listContracts, type ContractStage } from "@/lib/data/contracts";
import { listClients } from "@/lib/data/clients";
import { listWorks } from "@/lib/data/works";
import { isInternal } from "@/lib/clients/internal";
import { CONTRACT_ENDING_SOON_DAYS, endsInDays, hasEnded, todayKey } from "@/lib/contracts/helpers";
import { isOverdue, nextDue, progress } from "@/lib/works/helpers";
import { fmtMyrShort } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectNav } from "@/components/select-nav";
import { cn } from "@/lib/utils";
import { StageBadge, requirementsLabel } from "./ui";

export const dynamic = "force-dynamic";

type SP = { as?: string; stage?: string; am?: string; client?: string };

function isStage(v: string | undefined): v is ContractStage {
    return Boolean(v) && (CONTRACT_STAGES as readonly string[]).includes(v!);
}

export default async function ContractsPage({ searchParams }: { searchParams: Promise<SP> }) {
    await requireTeamAccess();
    const sp = await searchParams;
    const [contracts, works, clients] = await Promise.all([listContracts(), listWorks(), listClients()]);
    const today = todayKey();

    const stage = isStage(sp.stage) ? sp.stage : "";
    const am = (sp.am ?? "").trim();
    const client = (sp.client ?? "").trim();
    const ams = [...new Set(contracts.map((c) => c.accountManager).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const clientNames = [...new Set(contracts.map((c) => c.clientName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const list = contracts.filter((c) => (!stage || c.stage === stage) && (!am || c.accountManager === am) && (!client || c.clientName === client));
    const filtered = Boolean(stage || am || client);

    /** This page with the filters changed; `undefined` drops one. */
    const href = (extra: Partial<Record<"stage" | "am" | "client", string | undefined>>) => {
        const q = new URLSearchParams();
        const next = { stage, am, client, ...extra };
        for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
        if (sp.as) q.set("as", sp.as);
        const s = q.toString();
        return s ? `/projects?${s}` : "/projects";
    };
    const newQ = new URLSearchParams();
    if (client) newQ.set("client", client);
    if (sp.as) newQ.set("as", sp.as);
    const newHref = newQ.toString() ? `/projects/new?${newQ}` : "/projects/new";

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">Accounts</h1>
                    <p className="text-sm text-muted-foreground">Every job we do, for a client or for ourselves, with its tasks month by month.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Button nativeButton={false} render={<Link href={newHref} />}>
                        + New account
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
                <SelectNav
                    label="Stage"
                    value={stage}
                    options={[
                        { value: "", label: "All", href: href({ stage: undefined }) },
                        ...CONTRACT_STAGES.map((s) => ({ value: s, label: CONTRACT_STAGE_LABEL[s], href: href({ stage: s }) })),
                    ]}
                />
                {ams.length > 1 ? (
                    <SelectNav
                        label="Account manager"
                        value={am}
                        options={[{ value: "", label: "All", href: href({ am: undefined }) }, ...ams.map((n) => ({ value: n, label: n, href: href({ am: n }) }))]}
                    />
                ) : null}
                <SelectNav
                    label="Client"
                    value={clientNames.includes(client) ? client : ""}
                    options={[
                        { value: "", label: "All", href: href({ client: undefined }) },
                        ...clientNames.map((n) => ({ value: n, label: n, href: href({ client: n }) })),
                    ]}
                />
                {filtered ? (
                    <Link href={href({ stage: undefined, am: undefined, client: undefined })} className="text-muted-foreground underline">
                        Clear
                    </Link>
                ) : null}
            </div>

            {/* The list */}
            <div className="rounded-lg border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3 text-sm">
                    <span className="font-medium">
                        {list.length} account{list.length === 1 ? "" : "s"}
                        {filtered ? <span className="font-normal text-muted-foreground"> of {contracts.length}</span> : null}
                    </span>
                    <span className="hidden text-xs text-muted-foreground md:inline">Name · client · stage · term · value · tasks · next due</span>
                </div>
                {list.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        {contracts.length === 0 ? (
                            <>
                                No accounts yet.{" "}
                                <Link href={newHref} className="underline">
                                    Write the first one
                                </Link>
                                .
                            </>
                        ) : (
                            "Nothing matches these filters."
                        )}
                    </p>
                ) : (
                    <ul className="divide-y">
                        {list.map((c) => {
                            const tasks = works.filter((w) => w.contractId === c.id);
                            const tp = progress(tasks);
                            const overdue = tasks.filter((w) => isOverdue(w, today)).length;
                            const next = nextDue(tasks);
                            const days = endsInDays(c, today);
                            const ended = hasEnded(c, today);
                            const reqs = requirementsLabel(c.requirements);
                            const internal = isInternal(c, clients);
                            return (
                                <li key={c.id}>
                                    <Link
                                        href={`/projects/${c.id}${sp.as ? `?as=${encodeURIComponent(sp.as)}` : ""}`}
                                        className="grid gap-x-4 gap-y-1 p-3 transition-colors hover:bg-accent/50 md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_auto_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.1fr)] md:items-center md:px-4"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate font-medium">{c.name}</p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {c.code}
                                                {c.accountManager ? ` · AM ${c.accountManager}` : " · no account manager"}
                                                {c.handover ? ` · transfer to ${c.handover.to} pending` : ""}
                                                {reqs ? ` · ${reqs}` : ""}
                                            </p>
                                        </div>
                                        <p className="truncate text-sm text-muted-foreground md:text-foreground">{c.clientName}</p>
                                        <div className="flex flex-wrap items-center gap-1">
                                            <StageBadge stage={c.stage} status={c.status} internal={internal} />
                                            {internal ? <Badge variant="outline">internal</Badge> : null}
                                            {ended ? (
                                                <Badge variant="destructive">ended</Badge>
                                            ) : days !== null && days <= CONTRACT_ENDING_SOON_DAYS ? (
                                                <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
                                                    ends in {days}d
                                                </Badge>
                                            ) : null}
                                        </div>
                                        <p className="text-xs tabular-nums text-muted-foreground">
                                            {c.startDate || "—"}
                                            {c.endDate ? ` → ${c.endDate}` : " → open-ended"}
                                        </p>
                                        <p className="text-xs tabular-nums">
                                            {c.valueMyr ? fmtMyrShort(c.valueMyr) : <span className="text-muted-foreground">{internal ? "—" : "no value"}</span>}
                                        </p>
                                        <p className="text-xs tabular-nums">
                                            {tp.total === 0 ? (
                                                <span className="text-muted-foreground">no tasks</span>
                                            ) : (
                                                <>
                                                    <span className="font-medium">
                                                        {tp.done}/{tp.total}
                                                    </span>
                                                    <span className="text-muted-foreground"> done</span>
                                                    {overdue > 0 ? <span className="font-medium text-red-600 dark:text-red-400"> · {overdue} overdue</span> : null}
                                                </>
                                            )}
                                        </p>
                                        <p className="truncate text-xs tabular-nums text-muted-foreground">
                                            {next ? (
                                                <>
                                                    <span className={cn(next.dueDate < today && "font-medium text-red-600 dark:text-red-400")}>{next.dueDate}</span> · {next.title}
                                                </>
                                            ) : tp.total > 0 ? (
                                                "nothing open"
                                            ) : (
                                                "—"
                                            )}
                                        </p>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
