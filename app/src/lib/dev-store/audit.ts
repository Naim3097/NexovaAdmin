/**
 * DEV-ONLY audit log — captures real, point-in-time field-level change events
 * for leads, projects, invoices, and campaigns.
 *
 * Distinct from `activity.ts` which DERIVES events from current record state.
 * Audit events are the actual diff trail: every change emits one row that
 * survives subsequent edits.
 *
 * Replaced by Supabase `audit_events` table (one row per change) once
 * provisioned. Same shape — actions can keep calling `recordAudit()`.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.join(process.cwd(), ".dev-data");
const AUDIT_DIR = path.join(ROOT, "audit");

export const AUDIT_ENTITIES = [
    "lead",
    "project",
    "invoice",
    "campaign",
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export const AUDIT_KINDS = [
    "create",
    "update",
    "status",
    "delete",
] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

export type AuditChange = {
    field: string;
    /** Stringified previous value, "" when none. */
    before: string;
    /** Stringified new value, "" when cleared. */
    after: string;
};

export type AuditEvent = {
    id: string;
    at: string;
    entity: AuditEntity;
    entityId: string;
    kind: AuditKind;
    /** Free-form one-liner — used in feeds. */
    summary: string;
    /** Empty when actor is unknown (DEV bypass). */
    actor: string;
    /** Field-level diff, may be empty for create/delete. */
    changes: AuditChange[];
};

async function ensureDir() {
    await fs.mkdir(AUDIT_DIR, { recursive: true });
}

function fileFor(id: string) {
    return path.join(AUDIT_DIR, `${id}.json`);
}

/**
 * Append an audit row. Best-effort; failures must not break the action.
 */
export async function recordAudit(input: {
    entity: AuditEntity;
    entityId: string;
    kind: AuditKind;
    summary: string;
    actor?: string;
    changes?: AuditChange[];
}): Promise<void> {
    try {
        await ensureDir();
        const ev: AuditEvent = {
            id: randomUUID(),
            at: new Date().toISOString(),
            entity: input.entity,
            entityId: input.entityId,
            kind: input.kind,
            summary: input.summary,
            actor: input.actor ?? "",
            changes: input.changes ?? [],
        };
        await fs.writeFile(fileFor(ev.id), JSON.stringify(ev, null, 2), "utf8");
    } catch {
        // Audit failures must not break workflow.
    }
}

async function readAll(): Promise<AuditEvent[]> {
    await ensureDir();
    const entries = await fs.readdir(AUDIT_DIR);
    const out: AuditEvent[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        try {
            const raw = await fs.readFile(
                path.join(AUDIT_DIR, entry),
                "utf8",
            );
            out.push(JSON.parse(raw) as AuditEvent);
        } catch {
            // skip
        }
    }
    return out;
}

export async function listAuditForEntity(
    entity: AuditEntity,
    entityId: string,
): Promise<AuditEvent[]> {
    const all = await readAll();
    return all
        .filter((e) => e.entity === entity && e.entityId === entityId)
        .sort((a, b) => b.at.localeCompare(a.at));
}

export async function listRecentAudit(limit = 50): Promise<AuditEvent[]> {
    const all = await readAll();
    return all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

// ---------- diff helper ----------

function stringify(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
}

/**
 * Compute changed fields between two records. Only the explicitly-listed
 * fields are inspected — call sites pick which fields are auditable.
 */
export function diffFields<T extends Record<string, unknown>>(
    before: T,
    after: T,
    fields: readonly (keyof T & string)[],
): AuditChange[] {
    const changes: AuditChange[] = [];
    for (const f of fields) {
        const a = stringify(before[f]);
        const b = stringify(after[f]);
        if (a !== b) {
            changes.push({ field: f, before: a, after: b });
        }
    }
    return changes;
}
