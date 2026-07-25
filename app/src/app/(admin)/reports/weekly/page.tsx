import Link from "next/link";
import { listClients } from "@/lib/data/clients";
import { listContentPosts } from "@/lib/data/content";
import { listProjects } from "@/lib/data/projects";
import { listInvoices } from "@/lib/data/invoices";
import { CopyButton } from "@/components/copy-button";
import {
    buildWeeklyUpdate,
    weeklyUpdateText,
} from "@/lib/reports/weekly-update";

export const dynamic = "force-dynamic";

function eq(a: string, b: string) {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function Section({ title, items }: { title: string; items: string[] }) {
    return (
        <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {title}
            </p>
            {items.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">—</p>
            ) : (
                <ul className="mt-1 space-y-1">
                    {items.map((it, i) => (
                        <li key={i} className="text-sm">
                            {it}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/**
 * Weekly client updates — the playbook's slide-13 template, drafted from live
 * data for every active client. The AM picks a client, reads, tweaks nothing or
 * one line, hits Copy, and sends. Monday mornings stop being a writing task.
 */
export default async function WeeklyUpdatesPage({
    searchParams,
}: {
    searchParams: Promise<{ client?: string }>;
}) {
    const { client: clientParam } = await searchParams;
    const [clients, posts, projects, invoices] = await Promise.all([
        listClients(),
        listContentPosts(),
        listProjects(),
        listInvoices(),
    ]);

    const active = clients.filter((c) => c.status === "active");
    const selected =
        (clientParam && active.find((c) => eq(c.name, clientParam))) ||
        active[0];

    const pill = (on: boolean) =>
        `rounded-full border px-3 py-1 text-xs ${on ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`;

    const update = selected
        ? buildWeeklyUpdate({ client: selected, posts, projects, invoices })
        : null;
    const text = update ? weeklyUpdateText(update) : "";

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        Weekly updates
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Auto-drafted from live data — review, copy, send.
                    </p>
                </div>
                <Link
                    href="/reports"
                    className="text-sm text-muted-foreground hover:underline"
                >
                    Back to reports
                </Link>
            </div>

            {active.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No active clients.
                </p>
            ) : (
                <>
                    <div className="flex flex-wrap gap-2">
                        {active.map((c) => (
                            <Link
                                key={c.id}
                                href={`/reports/weekly?client=${encodeURIComponent(c.name)}`}
                                className={pill(
                                    !!selected && eq(c.name, selected.name),
                                )}
                            >
                                {c.name}
                            </Link>
                        ))}
                    </div>

                    {update ? (
                        <div className="max-w-2xl rounded-xl border bg-card">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                                <div>
                                    <p className="text-sm font-semibold">
                                        {update.clientName}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {update.rangeLabel} · AM:{" "}
                                        {update.accountManager || "unassigned"}
                                    </p>
                                </div>
                                <CopyButton text={text} label="Copy update" />
                            </div>
                            <div className="space-y-5 p-5">
                                <Section
                                    title="Completed this week"
                                    items={update.completed}
                                />
                                <Section
                                    title="In progress"
                                    items={update.inProgress}
                                />
                                <Section
                                    title="Waiting on the client"
                                    items={update.waitingFor}
                                />
                                <Section
                                    title="Next week"
                                    items={update.nextWeek}
                                />
                                <Section
                                    title="Issues / risks"
                                    items={update.issues}
                                />
                            </div>
                        </div>
                    ) : null}
                </>
            )}
        </div>
    );
}
