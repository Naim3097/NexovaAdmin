import Link from "next/link";
import { listTemplates } from "@/lib/data/workflows";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function WorkflowsSettingsPage() {
    const templates = await listTemplates();

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/settings"
                    className="text-sm text-muted-foreground hover:underline"
                >
                    ← Settings
                </Link>
                <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
                    Delivery workflows
                </h1>
                <p className="text-sm text-muted-foreground">
                    The standard stage pipeline per service. New projects copy
                    these; each project can then diverge.
                </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                {templates.map((t) => (
                    <Link
                        key={t.serviceCategory}
                        href={`/settings/workflows/${t.serviceCategory}`}
                        className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
                    >
                        <div className="flex items-center justify-between gap-2">
                            <p className="font-medium">{t.name}</p>
                            <Badge variant="outline">{t.serviceCategory}</Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                            {t.stages.length} stages ·{" "}
                            {t.stages.map((s) => s.label).join(" → ")}
                        </p>
                    </Link>
                ))}
            </div>
        </div>
    );
}
