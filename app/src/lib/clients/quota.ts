/**
 * How much content a client is owed a month, read off their projects.
 *
 * The client record carries no content quota any more: each project lists its
 * deliverables (`requirements`), and the "post" rows are the content items.
 * A client's monthly content quota is the sum of `tasksPerMonth` over the
 * post rows of their ACTIVE projects (weekly rows count four weeks; one-off
 * rows do not recur, so they count 0). Pure, no I/O.
 */
import { CONTENT_LINE_TYPES } from "@/lib/planners/vocab";
import type { Contract } from "@/lib/data/contracts";
import { tasksPerMonth } from "@/lib/contracts/requirements";
import { activeContractsFor } from "@/lib/clients/revenue";

/** Content items a month across the client's active projects; 0 = no content promised. */
export function clientContentQuota(clientName: string, contracts: Contract[]): number {
    return activeContractsFor(clientName, contracts).reduce(
        (sum, c) =>
            sum +
            c.requirements
                .filter((r) => CONTENT_LINE_TYPES.has(r.type))
                .reduce((s, r) => s + tasksPerMonth(r), 0),
        0,
    );
}
