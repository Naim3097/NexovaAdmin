import Link from "next/link";
import { getCurrentClient } from "@/lib/auth";
import { listPublishedReports } from "@/lib/data/report-insights";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function fmtMonth(m: string) {
    const [y, mo] = m.split("-").map(Number);
    return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
    });
}

export default async function PortalReportsPage() {
    const client = await getCurrentClient();
    if (!client) {
        return (
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold">Reports</h1>
                <p className="text-sm text-muted-foreground">
                    This account isn&apos;t linked to a client workspace yet.
                </p>
            </div>
        );
    }

    const reports = await listPublishedReports(client.name);

    return (
        <div className="space-y-6">
            <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {client.name}
                </p>
                <h1 className="text-2xl font-semibold">Monthly reports</h1>
            </div>

            {reports.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No reports published yet.
                </p>
            ) : (
                <div className="space-y-3">
                    {reports.map((r) => (
                        <Link key={r.id} href={`/portal/reports/${r.month}`}>
                            <Card className="transition hover:border-primary/50">
                                <CardContent className="flex items-center justify-between py-4">
                                    <span className="font-medium">
                                        {fmtMonth(r.month)}
                                    </span>
                                    <span className="text-sm text-primary">
                                        View report →
                                    </span>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
