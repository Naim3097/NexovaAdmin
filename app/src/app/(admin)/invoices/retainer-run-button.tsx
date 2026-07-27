"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
    generateRetainerInvoicesAction,
    type ActionResult,
} from "@/lib/invoices/actions";

const initial: ActionResult = { ok: false };

/**
 * One-click monthly retainer run (SOP 5, step 1). Drafts an invoice for every
 * active client with a retainer configured; safe to re-click — already-invoiced
 * clients are skipped via the per-month marker.
 */
export function RetainerRunButton() {
    const [state, formAction, pending] = useActionState(
        generateRetainerInvoicesAction,
        initial,
    );

    return (
        <div className="space-y-1">
            <form action={formAction}>
                <Button type="submit" variant="outline" disabled={pending}>
                    {pending ? "Drafting…" : "Generate retainer invoices"}
                </Button>
            </form>
            {state.message ? (
                <p
                    role="status"
                    className={`max-w-xs text-xs ${state.ok ? "text-muted-foreground" : "text-destructive"}`}
                >
                    {state.message}
                </p>
            ) : null}
        </div>
    );
}
