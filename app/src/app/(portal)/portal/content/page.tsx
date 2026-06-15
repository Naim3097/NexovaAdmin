import { getCurrentClient } from "@/lib/auth";
import { listContentPosts, type ContentPost } from "@/lib/data/content";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestContentForm } from "./request-content-form";

export const dynamic = "force-dynamic";

const CLIENT_STATUS_LABEL: Record<string, string> = {
    none: "In production",
    awaiting_client: "Ready for your review",
    changes_requested: "We're working on your changes",
    approved: "Approved",
};

function currentMonth() {
    return new Date().toISOString().slice(0, 7);
}

function StatusBadge({ post }: { post: ContentPost }) {
    const v =
        post.reviewStatus === "approved"
            ? "default"
            : post.reviewStatus === "awaiting_client"
                ? "secondary"
                : "outline";
    return <Badge variant={v}>{CLIENT_STATUS_LABEL[post.reviewStatus]}</Badge>;
}

export default async function PortalContentPage() {
    const client = await getCurrentClient();

    if (!client) {
        return (
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold">Content</h1>
                <p className="text-sm text-muted-foreground">
                    This account isn&apos;t linked to a client workspace yet.
                </p>
            </div>
        );
    }

    const month = currentMonth();
    const mine = (await listContentPosts())
        .filter(
            (p) =>
                p.clientName.trim().toLowerCase() ===
                client.name.trim().toLowerCase(),
        )
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const thisMonth = mine.filter((p) => p.planMonth === month);

    return (
        <div className="space-y-6">
            <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {client.name}
                </p>
                <h1 className="text-2xl font-semibold">Content</h1>
                <p className="text-sm text-muted-foreground">
                    Request content, then review and approve what we create.
                </p>
            </div>

            {/* Request form */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Request content</CardTitle>
                </CardHeader>
                <CardContent>
                    <RequestContentForm />
                </CardContent>
            </Card>

            {/* This month's items */}
            <div>
                <h2 className="mb-3 text-sm font-medium">
                    This month ({thisMonth.length})
                </h2>
                {thisMonth.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Nothing yet this month — submit a request above.
                    </p>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {thisMonth.map((post) => (
                            <Card key={post.id}>
                                <CardHeader className="pb-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <CardTitle className="text-sm">
                                            {post.title}
                                        </CardTitle>
                                        <StatusBadge post={post} />
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm">
                                    {post.currentFileUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={post.currentFileUrl}
                                            alt={post.title}
                                            className="max-h-48 w-full rounded border object-contain"
                                        />
                                    ) : null}
                                    {post.direction ? (
                                        <p className="line-clamp-3 text-xs text-muted-foreground">
                                            {post.direction}
                                        </p>
                                    ) : null}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
