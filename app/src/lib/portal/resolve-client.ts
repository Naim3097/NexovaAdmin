import { bypassEnabled } from "@/lib/dev-store/root";
import "server-only";

/**
 * Who the client portal is acting as, plus the pure queries the portal pages
 * share ("what is waiting on this client").
 *
 * A real login resolves through `getCurrentClient()` (clients.user_id). Under
 * DEV_AUTH_BYPASS there is no client login, so the portal pages accept
 * `?client=<client name>` and the portal forms carry the same name in a hidden
 * `client` field. Both are honoured ONLY while the bypass is on and never in a
 * production build — the same rule `lib/auth` applies to its fake admin user.
 */
import { getCurrentClient } from "@/lib/auth";
import { listClients, type Client } from "@/lib/data/clients";
import type { ContentPost } from "@/lib/data/content";
import type { Contract } from "@/lib/data/contracts";
import type { Work } from "@/lib/data/works";

const norm = (s: string) => s.trim().toLowerCase();

export function isDevBypass(): boolean {
    return bypassEnabled();
}

export type ActingClient = {
    client: Client;
    /** True when the client came from `?client=` under the dev bypass. */
    preview: boolean;
};

/**
 * The client this request acts as: the signed-in client, else (dev bypass
 * only) the client named by `preferredName`. Null when nothing resolves.
 */
export async function resolveActingClient(
    preferredName?: string | null,
): Promise<ActingClient | null> {
    const real = await getCurrentClient();
    if (real) return { client: real, preview: false };
    if (!isDevBypass()) return null;
    const want = norm(preferredName ?? "");
    if (!want) return null;
    const all = await listClients().catch(() => []);
    const hit = all.find((c) => norm(c.name) === want);
    return hit ? { client: hit, preview: true } : null;
}

/** A portal link that keeps the dev preview (`?client=`) when there is one. */
export function portalHref(path: string, acting: ActingClient | null): string {
    if (!acting?.preview) return path;
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}client=${encodeURIComponent(acting.client.name)}`;
}

/** How the client is named on reviews, the audit trail and notifications. */
export function clientActorName(
    client: Pick<Client, "name" | "contactName">,
): string {
    return `${client.contactName.trim() || client.name} (client, portal)`;
}

// ---------------------------------------------------------------------------
// Queries (pure — the pages and the layout badge share them)
// ---------------------------------------------------------------------------

export function contractsOf(
    contracts: Contract[],
    client: Pick<Client, "name">,
): Contract[] {
    const want = norm(client.name);
    return contracts.filter((c) => norm(c.clientName) === want);
}

/** Tasks under the client's contracts that wait on the client, oldest submission first. */
export function tasksWaitingFor(works: Work[], contracts: Contract[]): Work[] {
    const ids = new Set(contracts.map((c) => c.id));
    return works
        .filter(
            (w) =>
                ids.has(w.contractId) &&
                w.status === "pending_approval" &&
                w.approver === "client",
        )
        .sort((a, b) =>
            (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""),
        );
}

/** Content posts awaiting the client's review, newest first. */
/** Content posts already represented by a waiting task card (one approval per deliverable). */
export function linkedContentIds(waitingTasks: Work[]): Set<string> {
    return new Set(waitingTasks.flatMap((w) => (w.linked?.kind === "content" ? [w.linked.id] : [])));
}

export function postsWaitingFor(
    posts: ContentPost[],
    client: Pick<Client, "name">,
    exclude: Set<string> = new Set(),
): ContentPost[] {
    const want = norm(client.name);
    return posts
        .filter(
            (p) =>
                norm(p.clientName) === want &&
                p.reviewStatus === "awaiting_client" &&
                !exclude.has(p.id),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * The last `limit` client-approval tasks that were reviewed (by the client in
 * the portal, or by the account manager on their behalf), newest first.
 */
export function recentlyReviewed(
    works: Work[],
    contracts: Contract[],
    limit = 10,
): Work[] {
    const ids = new Set(contracts.map((c) => c.id));
    return works
        .filter(
            (w) =>
                ids.has(w.contractId) &&
                w.approver === "client" &&
                w.review.decision !== null &&
                Boolean(w.review.at),
        )
        .sort((a, b) => (b.review.at ?? "").localeCompare(a.review.at ?? ""))
        .slice(0, limit);
}
