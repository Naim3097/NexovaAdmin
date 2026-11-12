"use client";
/**
 * Where the renewal stands on an active project with an end date, set from the
 * client page in one pick. Saves at once through setRenewalStatusAction; the
 * border takes the colour the Clients tab gives the same status.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setRenewalStatusAction } from "@/lib/clients/actions";
import { RENEWAL_LABEL, RENEWAL_STATUSES, normalizeRenewalStatus, renewalLabel, type RenewalStatus } from "@/lib/contracts/renewal";
import { cn } from "@/lib/utils";

const TONE: Record<RenewalStatus, string> = {
    "": "border-red-500/40",
    at_risk: "border-red-500/40 text-red-700 dark:text-red-400",
    not_renewing: "border-red-500/40 text-red-700 dark:text-red-400",
    in_talks: "border-amber-500/40 text-amber-700 dark:text-amber-400",
    renewing: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
    renewed: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
};

export function RenewalSelect({ contractId, value }: { contractId: string; value: RenewalStatus }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [current, setCurrent] = useState<RenewalStatus>(value);

    const pick = (next: RenewalStatus) => {
        const previous = current;
        setCurrent(next);
        start(async () => {
            const r = await setRenewalStatusAction(contractId, next);
            if (!r.ok) {
                setCurrent(previous);
                toast.error(r.reason);
                return;
            }
            toast.success(`Renewal: ${renewalLabel(next)}`);
            router.refresh();
        });
    };

    return (
        <label className={cn("inline-flex h-8 shrink-0 items-center gap-1 rounded-md border bg-card px-2 text-xs shadow-xs hover:bg-accent", TONE[current], pending && "opacity-60")}>
            <span className="text-muted-foreground">Renewal</span>
            <select
                aria-label="Renewal status"
                value={current}
                disabled={pending}
                onChange={(e) => pick(normalizeRenewalStatus(e.target.value))}
                className="cursor-pointer appearance-none bg-transparent pr-4 font-medium outline-none"
                style={{
                    backgroundImage:
                        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5'><path d='m6 9 6 6 6-6'/></svg>\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 0 center",
                }}
            >
                <option value="">Not discussed</option>
                {RENEWAL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                        {RENEWAL_LABEL[s]}
                    </option>
                ))}
            </select>
        </label>
    );
}
