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
import { randomUUID } from "node:crypto";

const ROOT = path.join(process.cwd(), ".dev-data");
const CLIENTS_DIR = path.join(ROOT, "clients");

export const CLIENT_STATUSES = [
    "prospect",
    "active",
    "paused",
    "churned",
] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export type Client = {
    id: string;
    name: string;
    status: ClientStatus;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    website: string;
    industry: string;
    notes: string;
    /** Capped feedback cycles per content item (Axtra default: 3). */
    contentRevisionLimit: number;
    /** Content items the retainer covers per month (0 = no plan). */
    monthlyContentQuota: number;
    /** Client-level portal link token; '' until generated. */
    portalToken: string;
    /** Linked Supabase auth user for the client's portal login; null until invited. */
    userId: string | null;
    createdAt: string;
    updatedAt: string;
};

/** Backfill fields added after early dev rows were written. */
function normalizeClient(c: Client): Client {
    return {
        ...c,
        contentRevisionLimit: c.contentRevisionLimit ?? 3,
        monthlyContentQuota: c.monthlyContentQuota ?? 0,
        portalToken: c.portalToken ?? "",
        userId: c.userId ?? null,
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
    website?: string;
    industry?: string;
    notes?: string;
    contentRevisionLimit?: number;
    monthlyContentQuota?: number;
    portalToken?: string;
    userId?: string | null;
}): Promise<Client> {
    await ensureDir();
    const now = new Date().toISOString();
    const c: Client = {
        id: randomUUID(),
        name: input.name,
        status: input.status ?? "prospect",
        contactName: input.contactName ?? "",
        contactEmail: input.contactEmail ?? "",
        contactPhone: input.contactPhone ?? "",
        website: input.website ?? "",
        industry: input.industry ?? "",
        notes: input.notes ?? "",
        contentRevisionLimit: input.contentRevisionLimit ?? 3,
        monthlyContentQuota: input.monthlyContentQuota ?? 0,
        portalToken: input.portalToken ?? "",
        userId: input.userId ?? null,
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
