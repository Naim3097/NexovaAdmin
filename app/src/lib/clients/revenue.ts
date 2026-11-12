/**
 * What a client pays us a month, read off their projects.
 *
 * The client record carries no money any more: the retainer lives on each
 * project's billing (`billing.cadence`, `billing.amountMyr`). A client's
 * monthly revenue is the sum of the monthly amounts over their ACTIVE
 * projects; one-off projects are not recurring and are left
 * out. Pure, no I/O, so pages and management metrics can share it.
 */
import type { Contract } from "@/lib/data/contracts";

const norm = (s: string) => s.trim().toLowerCase();

/** The client's active projects (names matched the way the rest of the app does: trim + case-insensitive). */
export function activeContractsFor(clientName: string, contracts: Contract[]): Contract[] {
    const wanted = norm(clientName);
    return contracts.filter((c) => c.status === "active" && norm(c.clientName) === wanted);
}

/** MYR a month from the client's active monthly-billed projects. */
export function clientMonthlyMyr(clientName: string, contracts: Contract[]): number {
    const total = activeContractsFor(clientName, contracts)
        .filter((c) => c.billing.cadence === "monthly")
        .reduce((sum, c) => sum + (Number(c.billing.amountMyr) || 0), 0);
    return Math.round(total * 100) / 100;
}

/** Names of the client's active projects, for copy that used to show a package name. */
export function activeProjectNames(clientName: string, contracts: Contract[]): string[] {
    return activeContractsFor(clientName, contracts).map((c) => c.name);
}
