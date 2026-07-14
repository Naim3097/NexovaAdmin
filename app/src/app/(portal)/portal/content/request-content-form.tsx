"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    portalCreateContentAction,
    type PortalCreateState,
} from "@/lib/portal/actions";

const initial: PortalCreateState = { ok: false };

/**
 * Client content request with per-visual quota math shown up front:
 * a single post = 1 visual; a carousel = several. Picking Carousel reveals a
 * visuals stepper, and the live line shows exactly how many visuals remain in
 * the plan and how many (if any) will be chargeable — before submitting.
 */
export function RequestContentForm({
    quota = 0,
    used = 0,
    extraPrice = 0,
}: {
    /** Monthly visual quota (0 = no cap). */
    quota?: number;
    /** Visuals already used this month. */
    used?: number;
    extraPrice?: number;
}) {
    const [state, formAction, pending] = useActionState(
        portalCreateContentAction,
        initial,
    );
    const [carousel, setCarousel] = useState(false);
    const [visuals, setVisuals] = useState(3);

    const requested = carousel ? Math.max(2, visuals) : 1;
    const chargeable = quota > 0 ? Math.max(0, used + requested - quota) : 0;
    const remaining = quota > 0 ? Math.max(0, quota - used) : 0;

    return (
        <form action={formAction} className="space-y-3">
            <div className="space-y-1.5">
                <Label className="text-sm">What do you need?</Label>
                <Input name="title" required placeholder="e.g. Raya promo post" />
            </div>

            {/* Format: single visual vs carousel */}
            <div className="space-y-1.5">
                <Label className="text-sm">Format</Label>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setCarousel(false)}
                        className={`rounded-full border px-3 py-1 text-xs ${!carousel ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                    >
                        Single visual
                    </button>
                    <button
                        type="button"
                        onClick={() => setCarousel(true)}
                        className={`rounded-full border px-3 py-1 text-xs ${carousel ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                    >
                        Carousel
                    </button>
                    {carousel ? (
                        <div className="flex items-center gap-2">
                            <Input
                                name="visualCount"
                                type="number"
                                min={2}
                                max={20}
                                value={requested}
                                onChange={(e) =>
                                    setVisuals(
                                        Math.max(
                                            2,
                                            Math.min(
                                                20,
                                                Number(e.target.value) || 2,
                                            ),
                                        ),
                                    )
                                }
                                className="h-8 w-20"
                            />
                            <span className="text-xs text-muted-foreground">
                                visuals
                            </span>
                        </div>
                    ) : (
                        <input type="hidden" name="visualCount" value={1} />
                    )}
                </div>
                {/* Live quota math — no billing surprises */}
                {quota > 0 ? (
                    chargeable > 0 ? (
                        <p className="rounded-md border border-amber-400/40 bg-amber-50 p-2 text-xs text-amber-800">
                            This uses <strong>{requested}</strong> visual
                            {requested === 1 ? "" : "s"} — {remaining} left in
                            your plan, so <strong>{chargeable}</strong> will be
                            chargeable at{" "}
                            <strong>MYR {extraPrice.toFixed(2)}</strong> each.
                            Submitting means you agree to the charge.
                        </p>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            Uses {requested} of your {remaining} remaining
                            visual{remaining === 1 ? "" : "s"} this month (
                            {used}/{quota} used).
                        </p>
                    )
                ) : null}
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
