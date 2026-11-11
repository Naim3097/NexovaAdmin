/**
 * Shared bits for the contract pages. Server components only.
 */
import { Badge } from "@/components/ui/badge";
import { CONTRACT_STAGE_LABEL, type ContractStage, type ContractStatus, type Requirement } from "@/lib/data/contracts";
import type { JobStatus } from "@/lib/contracts/helpers";
import { cn } from "@/lib/utils";

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

export function cadenceLabel(cadence: string): string {
    return cadence.replace(/_/g, " ");
}

const REQ_WORDS: Record<Requirement["type"], [string, string]> = {
    post: ["post", "posts"],
    campaign: ["campaign", "campaigns"],
    seo: ["SEO article", "SEO articles"],
    website: ["website item", "website items"],
    branding: ["branding item", "branding items"],
    custom: ["custom task", "custom tasks"],
};

/** The scope in one line: "3 posts/mo · 1 campaign/mo · 1 website item (once)". */
export function requirementsLabel(reqs: Requirement[]): string {
    return reqs
        .filter((r) => r.count > 0)
        .map((r) => `${r.count} ${REQ_WORDS[r.type][r.count === 1 ? 0 : 1]}${r.cadence === "monthly" ? "/mo" : " (once)"}`)
        .join(" · ");
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
    onboarding: "border-transparent bg-violet-500/15 text-violet-700 dark:text-violet-400",
    official: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    delivering: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    completed: "border-transparent bg-muted text-muted-foreground",
};

/** The one status chip: Draft → Signed → Onboarding → Active → Running → Closed. */
export function StageBadge({ stage, status, className }: { stage: ContractStage; status?: ContractStatus; className?: string }) {
    if (status === "cancelled") {
        return (
            <Badge variant="destructive" className={className}>
                cancelled
            </Badge>
        );
    }
    return (
        <Badge variant="outline" className={cn(STAGE_CLASS[stage], className)}>
            {CONTRACT_STAGE_LABEL[stage]}
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
