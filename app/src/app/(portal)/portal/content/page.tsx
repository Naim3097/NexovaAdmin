import Link from "next/link";
import { getCurrentClient } from "@/lib/auth";
import { listContentPosts } from "@/lib/data/content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentCard } from "@/components/content-card";
import { RequestContentForm } from "./request-content-form";

export const dynamic = "force-dynamic";

const CLIENT_STATUS_LABEL: Record<string, string> = {
    none: "In production",
    awaiting_client: "Ready for your review",
    changes_requested: "We're on your changes",
    approved: "Approved",
};
const CLIENT_STATUS_VARIANT: Record<
    string,
    "default" | "secondary" | "outline" | "destructive"
> = {
    none: "outline",
    awaiting_client: "secondary",
    changes_requested: "outline",
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

export default async function PortalContentPage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string }>;
}) {
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

    const { month: monthParam } = await searchParams;
    const mine = (await listContentPosts())
        .filter(
            (p) =>
                p.clientName.trim().toLowerCase() ===
                client.name.trim().toLowerCase(),
        )
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const months = Array.from(
        new Set(
            [currentMonth(), ...mine.map((p) => p.planMonth).filter(Boolean)].filter(
                Boolean,
            ),
        ),
    ).sort((a, b) => (a < b ? 1 : -1));
    const selectedMonth =
        monthParam && months.includes(monthParam) ? monthParam : months[0];
    const monthPosts = mine.filter((p) => p.planMonth === selectedMonth);

    const pill = (active: boolean) =>
        `rounded-full border px-3 py-1 text-xs ${active ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`;

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

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Request content</CardTitle>
                </CardHeader>
                <CardContent>
                    <RequestContentForm />
                </CardContent>
            </Card>

            {/* Month tabs */}
            <div className="flex flex-wrap gap-2 border-b pb-3">
                {months.map((m) => (
                    <Link
                        key={m}
                        href={`/portal/content?month=${m}`}
                        className={pill(m === selectedMonth)}
                    >
                        {fmtMonth(m)}
                    </Link>
                ))}
            </div>

            {monthPosts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    Nothing for {fmtMonth(selectedMonth)} yet — submit a request
                    above.
                </p>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {monthPosts.map((post) => (
                        <ContentCard
                            key={post.id}
                            post={post}
                            statusLabel={CLIENT_STATUS_LABEL[post.reviewStatus]}
                            statusVariant={
                                CLIENT_STATUS_VARIANT[post.reviewStatus] ??
                                "outline"
                            }
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
