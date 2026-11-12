/**
 * Internal work: projects whose client is our own company (`Client.internal`).
 * They carry no contract to sign and no money, so sales, finance and client
 * reporting leave them out; delivery, capacity and everyone's tasks keep them.
 * Pure helpers over the records a page already loaded.
 */
import type { Client } from "@/lib/data/clients";

const norm = (s: string) => s.trim().toLowerCase();

/** Names of the internal clients, lower-cased. */
export function internalClientNames(clients: Client[]): Set<string> {
    return new Set(clients.filter((c) => c.internal).map((c) => norm(c.name)));
}

export function isInternalClient(name: string, clients: Client[]): boolean {
    return internalClientNames(clients).has(norm(name));
}

/** True when the record (a project, task, invoice…) belongs to an internal client. */
export function isInternal(record: { clientName: string }, clients: Client[]): boolean {
    return isInternalClient(record.clientName, clients);
}

/** The records that belong to real clients. */
export function externalOnly<T extends { clientName: string }>(list: T[], clients: Client[]): T[] {
    const internal = internalClientNames(clients);
    if (internal.size === 0) return list;
    return list.filter((r) => !internal.has(norm(r.clientName)));
}

/** The real clients. */
export function externalClients(clients: Client[]): Client[] {
    return clients.filter((c) => !c.internal);
}
