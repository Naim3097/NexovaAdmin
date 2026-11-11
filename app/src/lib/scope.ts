/**
 * Assignment scope — what a USER may see. Pure functions, no I/O.
 *
 * Admin and management see everything. A user sees the contracts they are the
 * account manager of or hold a task on, the clients of those contracts, and
 * the tasks they hold or must approve. Sales additionally see the pipeline.
 */
import type { Client } from "@/lib/data/clients";
import type { Contract } from "@/lib/data/contracts";
import type { TeamMember } from "@/lib/data/team";
import type { Work } from "@/lib/data/works";
import { awaitsApprovalFrom, involves } from "@/lib/works/helpers";
import { hasFunction, isManager } from "@/lib/roles";

type Member = Pick<TeamMember, "name" | "systemRoles" | "functions"> | null | undefined;

const norm = (s: string) => s.trim().toLowerCase();

/** True when the member sees everything (admin, management) or nobody is resolved (dev bypass with no pick). */
export function seesEverything(member: Member): boolean {
    return !member || isManager(member);
}

export function isAccountManagerOf(member: Member, c: Pick<Contract, "accountManager">): boolean {
    return Boolean(member && norm(c.accountManager) === norm(member.name));
}

/** Contract ids the member is on: AM of, or holding / approving a task under. */
export function assignedContractIds(member: Member, contracts: Contract[], works: Work[]): Set<string> {
    const out = new Set<string>();
    if (!member) return out;
    for (const c of contracts) if (isAccountManagerOf(member, c)) out.add(c.id);
    for (const w of works) if (involves(w, member.name) || awaitsApprovalFrom(w, member.name)) out.add(w.contractId);
    return out;
}

export function visibleContracts(member: Member, contracts: Contract[], works: Work[]): Contract[] {
    if (seesEverything(member)) return contracts;
    const ids = assignedContractIds(member, contracts, works);
    return contracts.filter((c) => ids.has(c.id));
}

export function canOpenContract(member: Member, c: Contract, works: Work[]): boolean {
    if (seesEverything(member)) return true;
    if (isAccountManagerOf(member, c)) return true;
    // Someone asked to take the contract over must be able to open it to answer.
    if (c.handover && norm(c.handover.to) === norm(member!.name)) return true;
    return works.some((w) => w.contractId === c.id && (involves(w, member!.name) || awaitsApprovalFrom(w, member!.name)));
}

/** Tasks the member holds a share of, must approve, or manages as the contract's account manager. */
export function visibleWorks(member: Member, works: Work[]): Work[] {
    if (seesEverything(member)) return works;
    const me = norm(member!.name);
    return works.filter((w) => involves(w, member!.name) || awaitsApprovalFrom(w, member!.name) || norm(w.accountManager) === me);
}

/** Tasks on contracts the member is the AM of, plus their own (for AM views). */
export function worksOnMyContracts(member: Member, contracts: Contract[], works: Work[]): Work[] {
    if (seesEverything(member)) return works;
    const ids = assignedContractIds(member, contracts, works);
    return works.filter((w) => ids.has(w.contractId));
}

/** Clients of the visible contracts (users), everything for managers. */
export function visibleClients(member: Member, clients: Client[], contracts: Contract[], works: Work[]): Client[] {
    if (seesEverything(member)) return clients;
    const names = new Set(visibleContracts(member, contracts, works).map((c) => norm(c.clientName)));
    return clients.filter((c) => names.has(norm(c.name)));
}

export function canOpenClient(member: Member, client: Pick<Client, "name">, contracts: Contract[], works: Work[]): boolean {
    if (seesEverything(member)) return true;
    return visibleContracts(member, contracts, works).some((c) => norm(c.clientName) === norm(client.name));
}

/** Contracts whose account-manager transfer is waiting on this member. */
export function pendingTransfersFor(member: Member, contracts: Contract[]): Contract[] {
    if (!member) return [];
    const me = norm(member.name);
    return contracts.filter((c) => c.handover && norm(c.handover.to) === me);
}

/** Pipeline and leads: managers and the sales function. */
export function seesPipeline(member: Member): boolean {
    return seesEverything(member) || hasFunction(member, "sales");
}

/** Money pages: managers and the finance / account-manager functions. */
export function seesFinance(member: Member): boolean {
    return seesEverything(member) || hasFunction(member, "finance", "account_manager");
}
