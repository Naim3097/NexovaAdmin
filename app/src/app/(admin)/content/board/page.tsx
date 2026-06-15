import Link from "next/link";
import { listContentPosts, type ContentPost } from "@/lib/data/content";
import { listClients } from "@/lib/data/clients";
import { ContentCard } from "@/components/content-card";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
    none: "In production",
    awaiting_client: "Awaiting client",
    changes_requested: "Changes requested",
    approved: "Approved",
};
const STATUS_VARIANT: Record<
    string,
    "default" | "secondary" | "outline" | "destructive"
> = {
    none: "outline",
    awaiting_client: "secondary",
    changes_requested: "destructive",
    approved: "default",
};

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

export default async function ContentBoardPage({
    searchParams,
}: {
    searchParams: Promise<{ client?: string; month?: string }>;
}) {
    const { client: clientParam, month: monthParam } = await searchParams;
    const [posts, clients] = await Promise.all([
        listContentPosts(),
        listClients(),
    ]);

    const clientNames = clients.map((c) => c.name);
    const selectedClient =
        clientParam && clientNames.some((n) => eq(n, clientParam))
            ? clientNames.find((n) => eq(n, clientParam))!
            : (clientNames[0] ?? "");

    const clientPosts = posts.filter((p) => eq(p.clientName, selectedClient));

    const months = Array.from(
        new Set(
            [
                currentMonth(),
                ...clientPosts.map((p) => p.planMonth).filter(Boolean),
            ].filter(Boolean),
        ),
    ).sort((a, b) => (a < b ? 1 : -1));
    const selectedMonth =
        monthParam && months.includes(monthParam)
            ? monthParam
            : (months[0] ?? currentMonth());

    const monthPosts = clientPosts
        .filter((p) => p.planMonth === selectedMonth)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const pill = (active: boolean) =>
        `rounded-full border px-3 py-1 text-xs ${active ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        Content board
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Review what each client has in flight, by month.
                    </p>
                </div>
                <Link
                    href="/content"
                    className="text-sm text-muted-foreground hover:underline"
                >
                    List / calendar view
                </Link>
            </div>

            {clientNames.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No clients yet. Add one in Settings → Clients.
                </p>
            ) : (
                <>
                    {/* Client switcher */}
                    <div className="flex flex-wrap gap-2">
                        {clientNames.map((name) => (
                            <Link
                                key={name}
                                href={`/content/board?client=${encodeURIComponent(name)}`}
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
                                href={`/content/board?client=${encodeURIComponent(selectedClient)}&month=${m}`}
                                className={pill(m === selectedMonth)}
                            >
                                {fmtMonth(m)}
                            </Link>
                        ))}
                    </div>

                    {/* Cards */}
                    {monthPosts.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Nothing for {selectedClient} in {fmtMonth(selectedMonth)}.
                        </p>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {monthPosts.map((post: ContentPost) => (
                                <ContentCard
                                    key={post.id}
                                    post={post}
                                    href={`/content/${post.id}`}
                                    statusLabel={
                                        STATUS_LABEL[post.reviewStatus] ??
                                        post.reviewStatus
                                    }
                                    statusVariant={
                                        STATUS_VARIANT[post.reviewStatus] ??
                                        "outline"
                                    }
                                />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
