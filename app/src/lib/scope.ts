/**
 * The personal slices: what is MINE. Pure functions, no I/O.
 *
 * Every page shows everything and filters; only My tasks and My accounts are
 * personal. These helpers pick the member's own tasks, the projects they are
 * the account manager of, and the clients of those projects. The old
 * assignment scoping (visibleContracts, visibleWorks, visibleClients,
 * canOpenContract) now returns everything so existing callers keep working.
 */
import type { Client } from "@/lib/data/clients";
import type { Contract } from "@/lib/data/contracts";
import type { TeamMember } from "@/lib/data/team";
import type { Work } from "@/lib/data/works";
import { awaitsApprovalFrom, involves } from "@/lib/works/helpers";
import { isManager, seesFinance as seesFinanceRole } from "@/lib/roles";

type Member = Pick<TeamMember, "name" | "systemRoles" | "functions"> | null | undefined;

const norm = (s: string) => s.trim().toLowerCase();

/** True for management, or when nobody is resolved (dev bypass with no pick). */
export function seesEverything(member: Member): boolean {
    return isManager(member);
}

export function isAccountManagerOf(member: Member, c: Pick<Contract, "accountManager">): boolean {
    return Boolean(member && norm(c.accountManager) === norm(member.name));
}

/** Is this person the account manager of at least one project (open or not). */
export function isAccountManager(member: Member, contracts: Contract[]): boolean {
    return Boolean(member) && contracts.some((c) => isAccountManagerOf(member, c));
}

/** Project ids the member is on: AM of, or holding / approving a task under. */
export function assignedContractIds(member: Member, contracts: Contract[], works: Work[]): Set<string> {
    const out = new Set<string>();
    if (!member) return out;
    for (const c of contracts) if (isAccountManagerOf(member, c)) out.add(c.id);
    for (const w of works) if (involves(w, member.name) || awaitsApprovalFrom(w, member.name)) out.add(w.contractId);
    return out;
}

/** Projects the member manages (My accounts). */
export function myContracts(member: Member, contracts: Contract[]): Contract[] {
    if (!member) return contracts;
    return contracts.filter((c) => isAccountManagerOf(member, c));
}

/** Tasks the member holds a share of or must approve (My tasks). */
export function myWorks(member: Member, works: Work[]): Work[] {
    if (!member) return works;
    return works.filter((w) => involves(w, member.name) || awaitsApprovalFrom(w, member.name));
}

/** Every project: pages show everything and filter. Kept for existing callers. */
export function visibleContracts(member: Member, contracts: Contract[], works: Work[]): Contract[] {
    void member;
    void works;
    return contracts;
}

export function canOpenContract(member: Member, c: Contract, works: Work[]): boolean {
    void member;
    void c;
    void works;
    return true;
}

/** Every task. Kept for existing callers; My tasks uses myWorks. */
export function visibleWorks(member: Member, works: Work[]): Work[] {
    void member;
    return works;
}

/** Tasks on projects the member is the AM of, plus their own (for AM views). */
export function worksOnMyContracts(member: Member, contracts: Contract[], works: Work[]): Work[] {
    if (!member) return works;
    const ids = assignedContractIds(member, contracts, works);
    return works.filter((w) => ids.has(w.contractId));
}

/** Every client. Kept for existing callers. */
export function visibleClients(member: Member, clients: Client[], contracts: Contract[], works: Work[]): Client[] {
    void member;
    void contracts;
    void works;
    return clients;
}

export function canOpenClient(member: Member, client: Pick<Client, "name">, contracts: Contract[], works: Work[]): boolean {
    void member;
    void client;
    void contracts;
    void works;
    return true;
}

/** Projects whose account-manager transfer is waiting on this member. */
export function pendingTransfersFor(member: Member, contracts: Contract[]): Contract[] {
    if (!member) return [];
    const me = norm(member.name);
    return contracts.filter((c) => c.handover && norm(c.handover.to) === me);
}

/** Pipeline and leads: everyone with the delivery duty, and management. Kept for existing callers. */
export function seesPipeline(member: Member): boolean {
    void member;
    return true;
}

/** Money pages: management and the finance duty. */
export function seesFinance(member: Member): boolean {
    return seesFinanceRole(member);
}
