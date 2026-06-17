"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    portalCreateContentAction,
    type PortalCreateState,
} from "@/lib/portal/actions";

const initial: PortalCreateState = { ok: false };

export function RequestContentForm({
    overQuota = false,
    extraPrice = 0,
}: {
    overQuota?: boolean;
    extraPrice?: number;
}) {
    const [state, formAction, pending] = useActionState(
        portalCreateContentAction,
        initial,
    );

    return (
        <form action={formAction} className="space-y-3">
            {overQuota ? (
                <p className="rounded-md border border-amber-400/40 bg-amber-50 p-3 text-xs text-amber-800">
                    You&apos;ve used your plan for this month. Extra content is
                    charged at <strong>MYR {extraPrice.toFixed(2)}</strong> each —
                    submitting below means you agree to the charge.
                </p>
            ) : null}
            <div className="space-y-1.5">
                <Label className="text-sm">What do you need?</Label>
                <Input name="title" required placeholder="e.g. Raya promo post" />
            </div>
            <div className="space-y-1.5">
                <Label className="text-sm">Direction</Label>
                <Textarea
                    name="direction"
                    rows={4}
                    placeholder="Tell us the goal, message, tone, must-haves…"
                />
            </div>
            <div className="space-y-1.5">
                <Label className="text-sm">Reference links (one per line)</Label>
                <Textarea
                    name="references"
                    rows={3}
                    placeholder={"https://…\nhttps://…"}
                />
            </div>
            <div className="flex items-center justify-between gap-3">
                {state.message ? (
                    <p
                        role="status"
                        className={`text-sm ${state.ok ? "text-green-600" : "text-destructive"}`}
                    >
                        {state.message}
                    </p>
                ) : (
                    <span />
                )}
                <Button type="submit" disabled={pending}>
                    {pending ? "Submitting…" : "Submit request"}
                </Button>
            </div>
        </form>
    );
}
