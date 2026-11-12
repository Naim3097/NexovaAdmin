/**
 * Review board of a Delivery content page (Static posts or Video posts): one
 * client and one month at a time, a card per post of that kind with its
 * review lights. The visuals meter counts this kind only, against the
 * deliverable rows of the same task type on the client's active projects.
 */
import Link from "next/link";
import { listContentPosts, visualsUsed, type ContentPost } from "@/lib/data/content";
import { listClients } from "@/lib/data/clients";
import { listContracts } from "@/lib/data/contracts";
import { listWorks } from "@/lib/data/works";
import {
    CONTENT_KIND_LABEL,
    kindContentQuota,
    kindHref,
    linkedTaskTypes,
    postsOfKind,
    type ContentKind,
} from "@/lib/content/kind";
import { ContentCard } from "@/components/content-card";
import { ContentViewLinks } from "./view-links";

export type ContentBoardParams = { client?: string; month?: string; as?: string };

function currentMonth() {
    return new Date().toISOString().slice(0, 7);
}
function fmtMonth(m: string) {
    const [y, mo] = m.split("-").map(Number);
    return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
    });
}
function eq(a: string, b: string) {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function ContentBoardView({ kind, params }: { kind: ContentKind; params: ContentBoardParams }) {
    const { client: clientParam, month: monthParam, as } = params;
    const [allPosts, clients, contracts, works] = await Promise.all([
        listContentPosts(),
        listClients(),
        listContracts(),
        listWorks(),
    ]);
    const posts = postsOfKind(allPosts, kind, linkedTaskTypes(works));
    const label = CONTENT_KIND_LABEL[kind];

    const clientNames = clients.map((c) => c.name);
    const selectedClient =
        clientParam && clientNames.some((n) => eq(n, clientParam))
            ? clientNames.find((n) => eq(n, clientParam))!
            : (clientNames[0] ?? "");

    const clientPosts = posts.filter((p) => eq(p.clientName, selectedClient));

    const months = Array.from(
        new Set([currentMonth(), ...clientPosts.map((p) => p.planMonth)].filter(Boolean)),
    ).sort((a, b) => (a < b ? 1 : -1));
    const selectedMonth = monthParam && months.includes(monthParam) ? monthParam : (months[0] ?? currentMonth());

    const monthPosts = clientPosts
        .filter((p) => p.planMonth === selectedMonth)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    // Per-visual quota meter for the selected client + month, this kind only.
    const quota = kindContentQuota(selectedClient, contracts, kind);
    const used = visualsUsed(posts, selectedClient, selectedMonth);
    const over = quota > 0 ? Math.max(0, used - quota) : 0;

    const pill = (active: boolean) =>
        `rounded-full border px-3 py-1 text-xs ${active ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">{label} board</h1>
                    <p className="text-sm text-muted-foreground">
                        Review the {label.toLowerCase()} each client has in flight, by month.
                    </p>
                </div>
                <ContentViewLinks kind={kind} current="board" as={as} />
            </div>

            {/* Traffic-light legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <span className="flex gap-0.5">
                        <span className="h-2 w-4 rounded-full bg-emerald-500" />
                        <span className="h-2 w-4 rounded-full bg-emerald-500" />
                        <span className="h-2 w-4 rounded-full bg-emerald-500" />
                        <span className="h-2 w-4 rounded-full bg-emerald-500" />
                    </span>
                    Direction · Headline · Draft · Approved
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded-full bg-amber-400" />
                    Changes requested
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded-full bg-neutral-200 dark:bg-neutral-700" />
                    Pending
                </span>
            </div>

            {clientNames.length === 0 ? (
                <p className="text-sm text-muted-foreground">No clients yet. Add one in Settings → Clients.</p>
            ) : (
                <>
                    {/* Client switcher */}
                    <div className="flex flex-wrap gap-2">
                        {clientNames.map((name) => (
                            <Link
                                key={name}
                                href={kindHref(kind, "board", { client: name, as })}
                                className={pill(eq(name, selectedClient))}
                            >
                                {name}
                            </Link>
                        ))}
                    </div>

                    {/* Month tabs */}
                    <div className="flex flex-wrap gap-2 border-b pb-3">
                        {months.map((m) => (
                            <Link
                                key={m}
                                href={kindHref(kind, "board", { client: selectedClient, month: m, as })}
                                className={pill(m === selectedMonth)}
                            >
                                {fmtMonth(m)}
                            </Link>
                        ))}
                    </div>

                    {/* Per-visual quota meter */}
                    {quota > 0 ? (
                        <div className="max-w-md space-y-1">
                            <div className="flex items-baseline justify-between text-xs">
                                <span className="text-muted-foreground">
                                    Visuals used · {fmtMonth(selectedMonth)}
                                </span>
                                <span className={over > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>
                                    {used}/{quota}
                                    {over > 0 ? ` · ${over} beyond the plan` : ""}
                                </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                <div
                                    className={`h-full rounded-full ${
                                        over > 0 ? "bg-destructive" : used >= quota ? "bg-amber-400" : "bg-primary"
                                    }`}
                                    style={{ width: `${Math.min(100, (used / quota) * 100)}%` }}
                                />
                            </div>
                        </div>
                    ) : null}

                    {/* Cards */}
                    {monthPosts.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No {label.toLowerCase()} for {selectedClient} in {fmtMonth(selectedMonth)}.
                        </p>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {monthPosts.map((post: ContentPost) => (
                                <ContentCard key={post.id} post={post} href={`/content/${post.id}`} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
