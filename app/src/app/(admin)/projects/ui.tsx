/**
 * Shared bits for the project pages. Server components only.
 */
import { Badge } from "@/components/ui/badge";
import { stageLabel, type ContractStage, type ContractStatus } from "@/lib/data/contracts";
import type { JobStatus } from "@/lib/contracts/helpers";
import { cn } from "@/lib/utils";

// The scope labels ("Awareness post on Instagram · 4/wk · Website · once") live with the deliverable shape; re-exported for the project pages.
export { requirementsLabel, requirementLabel, requirementName } from "@/lib/contracts/requirements";

/** "RM 10,500" — the full amount for invoice and quote rows; summaries use fmtMyrShort from "@/lib/format". */
export function fmtMyr(n: number): string {
    return `RM ${Math.round(n).toLocaleString("en-MY")}`;
}

export function monthLabel(ym: string): string {
    if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-MY", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    });
}

/** "monthly" / "one-off", for running text ("Billed monthly"). */
export function cadenceLabel(cadence: string): string {
    return cadence === "one_off" ? "one-off" : cadence.replace(/_/g, " ");
}

/** "Monthly" / "One-off", for the billing pickers. */
export function cadenceOption(cadence: string): string {
    const s = cadenceLabel(cadence);
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
    return (
        <Badge variant={status === "active" ? "default" : status === "cancelled" ? "destructive" : "outline"}>
            {status}
        </Badge>
    );
}

const STAGE_CLASS: Record<ContractStage, string> = {
    created: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
    signed: "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400",
    delivering: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    completed: "border-transparent bg-muted text-muted-foreground",
};

/** The one status chip: Draft → Signed (Approved on an internal project) → Running → Closed. */
export function StageBadge({ stage, status, internal, className }: { stage: ContractStage; status?: ContractStatus; internal?: boolean; className?: string }) {
    if (status === "cancelled") {
        return (
            <Badge variant="destructive" className={className}>
                cancelled
            </Badge>
        );
    }
    return (
        <Badge variant="outline" className={cn(STAGE_CLASS[stage], className)}>
            {stageLabel(stage, internal)}
        </Badge>
    );
}

const JOB_CLASS: Record<JobStatus["tone"], string> = {
    good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    bad: "bg-red-500/15 text-red-700 dark:text-red-400",
    neutral: "",
};

/** "Do we have a job with this client?" at a glance. */
export function JobBadge({ job, className }: { job: JobStatus; className?: string }) {
    return (
        <Badge variant="outline" className={cn("border-transparent", JOB_CLASS[job.tone], className)}>
            {job.label}
        </Badge>
    );
}
