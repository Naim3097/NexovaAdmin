/**
 * Why a deal was lost. Picked when a lead is marked lost; the Sales dashboard
 * counts them so the team sees what loses deals. Pure: no fs, safe in client code.
 */
export const LOST_REASONS = ["price", "timing", "competitor", "no_response", "scope", "other"] as const;
export type LostReasonKey = (typeof LOST_REASONS)[number];
/** "" = not recorded (older leads, or the lead is not lost). */
export type LostReason = LostReasonKey | "";

export const LOST_REASON_LABEL: Record<LostReasonKey, string> = {
    price: "Price",
    timing: "Timing",
    competitor: "Went elsewhere",
    no_response: "No response",
    scope: "Scope mismatch",
    other: "Other",
};

export function isLostReason(v: unknown): v is LostReasonKey {
    return typeof v === "string" && (LOST_REASONS as readonly string[]).includes(v);
}

export function normalizeLostReason(v: unknown): LostReason {
    return isLostReason(v) ? v : "";
}

/** "Price", or "Not recorded" for "". */
export function lostReasonLabel(r: LostReason): string {
    return r ? LOST_REASON_LABEL[r] : "Not recorded";
}
