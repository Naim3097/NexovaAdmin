"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    generateReportInsightsAction,
    type InsightsState,
} from "@/lib/reports/actions";

const initial: InsightsState = { ok: false };

export function GenerateInsightsButton({
    client,
    month,
    hasInsights,
}: {
    client: string;
    month: string;
    hasInsights: boolean;
}) {
    const [state, formAction, pending] = useActionState(
        generateReportInsightsAction,
        initial,
    );

    return (
        <div className="no-print flex items-center gap-3">
            {state.error ? (
                <span className="text-xs text-destructive">{state.error}</span>
            ) : null}
            <form action={formAction}>
                <input type="hidden" name="client" value={client} />
                <input type="hidden" name="month" value={month} />
                <Button
                    type="submit"
                    size="sm"
                    variant={hasInsights ? "outline" : "default"}
                    disabled={pending}
                >
                    <Sparkles className="mr-1 size-3.5" />
                    {pending
                        ? "Writing…"
                        : hasInsights
                            ? "Regenerate"
                            : "Generate insights"}
                </Button>
            </form>
        </div>
    );
}
