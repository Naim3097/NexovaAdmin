/**
 * DEV-ONLY local file store for services (agency offerings catalog).
 * Replaced by Supabase `services` table once provisioned.
 *
 * Each service has a default unit price in MYR used as a hint when adding
 * invoice line items. Currency stored as a code; only MYR for now.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.join(process.cwd(), ".dev-data");
const SERVICES_DIR = path.join(ROOT, "services");

export const SERVICE_CATEGORIES = [
    "website",
    "ads",
    "seo",
    "content",
    "app",
    "branding",
    "retainer",
    "other",
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export type Service = {
    id: string;
    name: string;
    category: ServiceCategory;
    unit: string; // e.g. "month", "project", "hour"
    defaultPrice: number; // MYR
    description: string;
    active: boolean;
    createdAt: string;
    updatedAt: string;
};

async function ensureDir() {
    await fs.mkdir(SERVICES_DIR, { recursive: true });
}

function fileFor(id: string) {
    return path.join(SERVICES_DIR, `${id}.json`);
}

export async function createService(input: {
    name: string;
    category?: ServiceCategory;
    unit?: string;
    defaultPrice?: number;
    description?: string;
}): Promise<Service> {
    await ensureDir();
    const now = new Date().toISOString();
    const s: Service = {
        id: randomUUID(),
        name: input.name,
        category: input.category ?? "other",
        unit: input.unit ?? "project",
        defaultPrice: Math.max(0, Number(input.defaultPrice ?? 0)),
        description: input.description ?? "",
        active: true,
        createdAt: now,
        updatedAt: now,
    };
    await fs.writeFile(fileFor(s.id), JSON.stringify(s, null, 2), "utf8");
    return s;
}

export async function listServices(): Promise<Service[]> {
    await ensureDir();
    const entries = await fs.readdir(SERVICES_DIR);
    const out: Service[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const raw = await fs.readFile(path.join(SERVICES_DIR, entry), "utf8");
        out.push(JSON.parse(raw) as Service);
    }
    return out.sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}

export async function getServiceById(id: string): Promise<Service | null> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        return JSON.parse(raw) as Service;
    } catch {
        return null;
    }
}

export async function updateService(
    id: string,
    patch: Partial<Omit<Service, "id" | "createdAt">>,
): Promise<Service> {
    const existing = await getServiceById(id);
    if (!existing) throw new Error(`Service ${id} not found`);
    const updated: Service = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(fileFor(id), JSON.stringify(updated, null, 2), "utf8");
    return updated;
}

export async function deleteService(id: string): Promise<void> {
    try {
        await fs.unlink(fileFor(id));
    } catch {
        // ignore
    }
}
