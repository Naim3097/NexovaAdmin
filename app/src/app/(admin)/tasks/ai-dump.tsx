"use client";

import { useActionState } from "react";
import { aiDumpTasksAction, type ActionResult } from "@/lib/sprint-tasks/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const initial: ActionResult = { ok: false };

/**
 * Brain-dump box: paste a blob of work, AI splits it into discrete tasks per PIC
 * (with deadlines where mentioned) and creates them.
 */
export function AiDump() {
    const [state, formAction, pending] = useActionState(
        aiDumpTasksAction,
        initial,
    );
    return (
        <form action={formAction} className="space-y-2">
            <Label className="text-sm">
                Brain-dump — AI splits it into tasks per PIC
            </Label>
            <Textarea
                name="dump"
                rows={4}
                placeholder={
                    "Paste anything, e.g.\nAiman — fix the homepage hero by Friday\nSiti to draft 3 IG posts for Zakat\nReview overdue invoices next week"
                }
            />
            <div className="flex items-center gap-3">
                <Button type="submit" disabled={pending}>
                    {pending ? "Parsing…" : "Parse with AI"}
                </Button>
                {state.message ? (
                    <span
                        className={`text-xs ${
                            state.ok ? "text-emerald-600" : "text-destructive"
                        }`}
                    >
                        {state.message}
                    </span>
                ) : null}
            </div>
        </form>
    );
}
