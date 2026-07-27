import Link from "next/link";
import { getCurrentClient } from "@/lib/auth";
import { listSubmissions } from "@/lib/data/onboarding";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function PortalOnboardingPage() {
    const client = await getCurrentClient();
    if (!client) {
        return (
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold">Forms</h1>
                <p className="text-sm text-muted-foreground">
                    This account isn&apos;t linked to a client workspace yet.
                </p>
            </div>
        );
    }

    const name = client.name.trim().toLowerCase();
    const mine = (await listSubmissions())
        .filter((s) => s.clientName.trim().toLowerCase() === name)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

    return (
        <div className="space-y-4">
            <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {client.name}
                </p>
                <h1 className="text-2xl font-semibold">Forms</h1>
                <p className="text-sm text-muted-foreground">
                    Onboarding forms we&apos;ve sent you — everything we need to
                    start work.
                </p>
            </div>

            {mine.length === 0 ? (
                <Card>
                    <CardContent className="py-6 text-sm text-muted-foreground">
                        No forms right now. Anything we send you will appear
                        here.
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {mine.map((s) => (
                        <Card key={s.id}>
                            <CardHeader className="pb-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <CardTitle className="text-sm">
                                        Onboarding — {s.checklistSlug || "general"}
                                    </CardTitle>
                                    <Badge
                                        variant={
                                            s.status === "submitted"
                                                ? "default"
                                                : "secondary"
                                        }
                                    >
                                        {s.status === "submitted"
                                            ? "Submitted"
                                            : "To complete"}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="flex items-center justify-between gap-2 text-sm">
                                <span className="text-xs text-muted-foreground">
                                    {s.status === "submitted" && s.submittedAt
                                        ? `Submitted ${s.submittedAt.slice(0, 10)}`
                                        : "We're waiting on this to start work."}
                                </span>
                                {s.status !== "submitted" ? (
                                    <Link
                                        href={`/onboard/${s.token}`}
                                        className={buttonVariants({
                                            size: "sm",
                                        })}
                                    >
                                        Fill in
                                    </Link>
                                ) : null}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
