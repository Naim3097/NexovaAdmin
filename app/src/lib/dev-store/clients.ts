/**
 * DEV-ONLY local file store for clients (agency's customers).
 * Replaced by Supabase `organizations` / `clients` table once provisioned.
 *
 * Identity is by `name` (string) to match how the rest of the app stores
 * `clientName` everywhere. The directory adds structured profile data
 * (contact, status, notes) and aggregation, without forcing an FK migration.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { devDataRoot } from "@/lib/dev-store/root";
import { randomUUID } from "node:crypto";

const ROOT = devDataRoot();
const CLIENTS_DIR = path.join(ROOT, "clients");

export const CLIENT_STATUSES = [
    "prospect",
    "onboarding",
    "active",
    "paused",
    "churned",
] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export type Client = {
    id: string;
    name: string;
    status: ClientStatus;
    /** Team member who closed the deal. Projects have their own account manager. */
    dealOwner: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    /** Formal billing address — prefills "Bill to" on new invoices/quotes. */
    billingAddress: string;
    website: string;
    industry: string;
    notes: string;
    /**
     * Capped feedback cycles per content item (default 3). A client rule about
     * how they review, not what they bought: what they bought (deliverables,
     * billing, term) lives on their projects.
     */
    contentRevisionLimit: number;
    /** Client-level portal link token; '' until generated. */
    portalToken: string;
    /** Linked Supabase auth user for the client's portal login; null until invited. */
    userId: string | null;
    /**
     * Our own company. Its projects are internal: no contract to sign (management
     * approves the brief instead), no money, out of sales, finance and client
     * reporting, but still in delivery, capacity and everyone's tasks.
     */
    internal: boolean;
    /** Last time we spoke to the client (YYYY-MM-DD, "" = never logged) and what was said. */
    lastCheckInAt: string;
    lastCheckInNote: string;
    createdAt: string;
    updatedAt: string;
};

/**
 * Backfill fields added after early dev rows were written, and drop the
 * package fields older rows still carry (monthly retainer, content quota,
 * package name / renewal, extra prices): projects and templates hold that now.
 */
function normalizeClient(raw: Client): Client {
    const c = raw as Client & { accountManager?: string };
    return {
        id: c.id,
        name: c.name,
        status: c.status ?? "prospect",
        dealOwner: c.dealOwner ?? c.accountManager ?? "",
        contactName: c.contactName ?? "",
        contactEmail: c.contactEmail ?? "",
        contactPhone: c.contactPhone ?? "",
        billingAddress: c.billingAddress ?? "",
        website: c.website ?? "",
        industry: c.industry ?? "",
        notes: c.notes ?? "",
        contentRevisionLimit: c.contentRevisionLimit ?? 3,
        portalToken: c.portalToken ?? "",
        userId: c.userId ?? null,
        internal: c.internal ?? false,
        lastCheckInAt: c.lastCheckInAt ?? "",
        lastCheckInNote: c.lastCheckInNote ?? "",
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
    };
}

async function ensureDir() {
    await fs.mkdir(CLIENTS_DIR, { recursive: true });
}

function fileFor(id: string) {
    return path.join(CLIENTS_DIR, `${id}.json`);
}

export async function createClient(input: {
    name: string;
    status?: ClientStatus;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    billingAddress?: string;
    website?: string;
    industry?: string;
    notes?: string;
    contentRevisionLimit?: number;
    portalToken?: string;
    userId?: string | null;
    dealOwner?: string;
    internal?: boolean;
    lastCheckInAt?: string;
    lastCheckInNote?: string;
}): Promise<Client> {
    await ensureDir();
    const now = new Date().toISOString();
    const c: Client = {
        id: randomUUID(),
        name: input.name,
        status: input.status ?? "prospect",
        dealOwner: input.dealOwner ?? "",
        contactName: input.contactName ?? "",
        contactEmail: input.contactEmail ?? "",
        contactPhone: input.contactPhone ?? "",
        billingAddress: input.billingAddress ?? "",
        website: input.website ?? "",
        industry: input.industry ?? "",
        notes: input.notes ?? "",
        contentRevisionLimit: input.contentRevisionLimit ?? 3,
        portalToken: input.portalToken ?? "",
        userId: input.userId ?? null,
        internal: input.internal ?? false,
        lastCheckInAt: input.lastCheckInAt ?? "",
        lastCheckInNote: input.lastCheckInNote ?? "",
        createdAt: now,
        updatedAt: now,
    };
    await fs.writeFile(fileFor(c.id), JSON.stringify(c, null, 2), "utf8");
    return c;
}

export async function listClients(): Promise<Client[]> {
    await ensureDir();
    const entries = await fs.readdir(CLIENTS_DIR);
    const out: Client[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const raw = await fs.readFile(path.join(CLIENTS_DIR, entry), "utf8");
        out.push(normalizeClient(JSON.parse(raw) as Client));
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getClientById(id: string): Promise<Client | null> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        return normalizeClient(JSON.parse(raw) as Client);
    } catch {
        return null;
    }
}

export async function getClientByPortalToken(
    token: string,
): Promise<Client | null> {
    if (!token) return null;
    const all = await listClients();
    return all.find((c) => c.portalToken && c.portalToken === token) ?? null;
}

export async function getClientByUserId(
    userId: string,
): Promise<Client | null> {
    if (!userId) return null;
    const all = await listClients();
    return all.find((c) => c.userId && c.userId === userId) ?? null;
}

export async function updateClient(
    id: string,
    patch: Partial<Omit<Client, "id" | "createdAt">>,
): Promise<Client> {
    const existing = await getClientById(id);
    if (!existing) throw new Error(`Client ${id} not found`);
    const updated: Client = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(fileFor(id), JSON.stringify(updated, null, 2), "utf8");
    return updated;
}

export async function deleteClient(id: string): Promise<void> {
    try {
        await fs.unlink(fileFor(id));
    } catch {
        // ignore
    }
}
