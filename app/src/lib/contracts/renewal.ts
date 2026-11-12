/**
 * Renewal standing on a project. Pure module: the
 * dev store, the Supabase adapter, the forms and the dashboards all read it.
 */
export const RENEWAL_STATUSES = ["in_talks", "renewing", "at_risk", "not_renewing", "renewed"] as const;
export type RenewalStatusKey = (typeof RENEWAL_STATUSES)[number];
/** "" = renewal not discussed yet. */
export type RenewalStatus = RenewalStatusKey | "";

export const RENEWAL_LABEL: Record<RenewalStatusKey, string> = {
    in_talks: "In talks",
    renewing: "Renewing",
    at_risk: "At risk",
    not_renewing: "Not renewing",
    renewed: "Renewed",
};

export function isRenewalStatus(v: unknown): v is RenewalStatusKey {
    return typeof v === "string" && (RENEWAL_STATUSES as readonly string[]).includes(v);
}

export function normalizeRenewalStatus(v: unknown): RenewalStatus {
    return isRenewalStatus(v) ? v : "";
}

/** "In talks", or "Not discussed" for "". */
export function renewalLabel(r: RenewalStatus): string {
    return r ? RENEWAL_LABEL[r] : "Not discussed";
}
