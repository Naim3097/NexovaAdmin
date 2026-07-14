"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Content Type picker + per-visual quota control.
 *
 * Picking "carousel" reveals a Visuals stepper (2–20) and a live quota line —
 * visuals are the quota unit (1 visual = 1 quota), so a 5-image carousel
 * consumes 5. Non-carousel types are locked to 1 visual. Submits `type` and
 * `visualCount` with the surrounding form.
 */
export function TypeVisualsFields({
    types,
    defaultType,
    defaultVisualCount,
    quota,
    usedByOthers,
}: {
    types: readonly string[];
    defaultType: string;
    defaultVisualCount: number;
    /** Client's monthly visual quota. 0 = no cap. */
    quota: number;
    /** Visuals used this month by the client's OTHER items. */
    usedByOthers: number;
}) {
    const [type, setType] = useState(defaultType);
    const [visuals, setVisuals] = useState(
        Math.max(1, defaultVisualCount || 1),
    );
    const isCarousel = type === "carousel";
    const effective = isCarousel ? Math.max(2, visuals) : 1;
    const totalUsed = usedByOthers + effective;
    const over = quota > 0 ? Math.max(0, totalUsed - quota) : 0;

    return (
        <>
            <div className="space-y-1.5">
                <Label className="text-sm">Type</Label>
                <select
                    name="type"
                    value={type}
                    onChange={(e) => {
                        setType(e.target.value);
                        if (e.target.value === "carousel" && visuals < 2) {
                            setVisuals(3);
                        }
                    }}
                    className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                    {types.map((t) => (
                        <option key={t} value={t}>
                            {t}
                        </option>
                    ))}
                </select>
            </div>

            {isCarousel ? (
                <div className="space-y-1.5">
                    <Label className="text-sm">Visuals in carousel</Label>
                    <Input
                        name="visualCount"
                        type="number"
                        min={2}
                        max={20}
                        value={effective}
                        onChange={(e) =>
                            setVisuals(
                                Math.max(
                                    2,
                                    Math.min(20, Number(e.target.value) || 2),
                                ),
                            )
                        }
                    />
                    <p
                        className={`text-xs ${over > 0 ? "font-medium text-destructive" : "text-muted-foreground"}`}
                    >
                        Uses {effective} of quota
                        {quota > 0
                            ? ` · ${totalUsed}/${quota} visuals this month${over > 0 ? ` · ${over} over (billable)` : ""}`
                            : ""}
                    </p>
                </div>
            ) : (
                <input type="hidden" name="visualCount" value={1} />
            )}
        </>
    );
}
