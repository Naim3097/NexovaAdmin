/**
 * Who a task is waiting on. The owner or account manager sets it from the
 * quick edit when a task is blocked on the client (assets, access, feedback)
 * or on someone inside; it clears when the task moves on. Pure module.
 */
export const WAITING_ON = ["client", "internal"] as const;
export type WaitingOnKey = (typeof WAITING_ON)[number];
/** "" = not waiting on anyone. */
export type WaitingOn = WaitingOnKey | "";

export const WAITING_ON_LABEL: Record<WaitingOnKey, string> = {
    client: "Waiting on client",
    internal: "Waiting on us",
};

export function isWaitingOn(v: unknown): v is WaitingOnKey {
    return typeof v === "string" && (WAITING_ON as readonly string[]).includes(v);
}

export function normalizeWaitingOn(v: unknown): WaitingOn {
    return isWaitingOn(v) ? v : "";
}

/** Whole days a task has been waiting as of `today` (YYYY-MM-DD); 0 when it is not waiting. */
export function waitingDays(w: { waitingOn: WaitingOn; waitingSince: string | null }, today: string): number {
    if (!w.waitingOn || !w.waitingSince) return 0;
    const since = Date.parse(w.waitingSince.slice(0, 10));
    const now = Date.parse(today);
    if (Number.isNaN(since) || Number.isNaN(now)) return 0;
    return Math.max(0, Math.floor((now - since) / 86_400_000));
}

/** "Waiting on client · 6d" for a chip; the day count is left off on the day it was marked. "" when not waiting. */
export function waitingLabel(w: { waitingOn: WaitingOn; waitingSince: string | null }, today: string): string {
    if (!w.waitingOn) return "";
    const days = waitingDays(w, today);
    return days > 0 ? `${WAITING_ON_LABEL[w.waitingOn]} · ${days}d` : WAITING_ON_LABEL[w.waitingOn];
}
