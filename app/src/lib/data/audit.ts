/**
 * Audit events data adapter (single-table cutover, append-only).
 *
 * `recordAudit` is best-effort. `diffFields` is a pure helper — re-export.
 */
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database, AuditEventRow } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as devAudit from "@/lib/dev-store/audit";

export { AUDIT_ENTITIES, AUDIT_KINDS, diffFields } from "@/lib/dev-store/audit";
export type {
    AuditChange,
    AuditEntity,
    AuditEvent,
    AuditKind,
} from "@/lib/dev-store/audit";

type AuditEvent = devAudit.AuditEvent;
type AuditEntity = devAudit.AuditEntity;
type AuditKind = devAudit.AuditKind;
type AuditChange = devAudit.AuditChange;

type AuditInsert = Database["public"]["Tables"]["audit_events"]["Insert"];

const TABLE = "audit_events" as const;

function rowToEvent(row: AuditEventRow): AuditEvent {
    return {
        id: row.id,
        at: row.at,
        entity: row.entity as AuditEntity,
        entityId: row.entity_id,
        kind: row.kind as AuditKind,
        summary: row.summary,
        actor: row.actor,
        changes: (row.changes ?? []) as unknown as AuditChange[],
    };
}

/**
 * Who is performing this action. Resolves the signed-in user to their team
 * member name (falling back to their email); returns "" outside a request,
 * e.g. cron jobs. Dynamic import keeps lib/auth out of this module's import
 * graph, and every failure degrades to "" rather than breaking the workflow.
 */
async function currentActor(): Promise<string> {
    try {
        const { getCurrentTeamMember, getCurrentUser } = await import("@/lib/auth");
        const member = await getCurrentTeamMember();
        if (member?.name) return member.name;
        const user = await getCurrentUser();
        return user?.email ?? "";
    } catch {
        return "";
    }
}

export async function recordAudit(input: {
    entity: AuditEntity;
    entityId: string;
    kind: AuditKind;
    summary: string;
    actor?: string;
    changes?: AuditChange[];
}): Promise<void> {
    // Stamp WHO unless the caller named someone explicitly. Without this the
    // trail says what changed but never who changed it.
    const actor = input.actor ?? (await currentActor());
    if (!isSupabaseEnabled("audit")) {
        return devAudit.recordAudit({ ...input, actor });
    }
    try {
        const sb = createServiceClient();
        const insert: AuditInsert = {
            id: randomUUID(),
            entity: input.entity,
            entity_id: input.entityId,
            kind: input.kind,
            summary: input.summary,
            actor,
            changes: input.changes ?? [],
        };
        await sb.from(TABLE).insert(insert);
    } catch {
        // Audit failures must not break workflow.
    }
}

export async function listAuditForEntity(
    entity: AuditEntity,
    entityId: string,
): Promise<AuditEvent[]> {
    if (!isSupabaseEnabled("audit")) {
        return devAudit.listAuditForEntity(entity, entityId);
    }
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("entity", entity)
        .eq("entity_id", entityId)
        .order("at", { ascending: false });
    if (error) throw new Error(`listAuditForEntity: ${error.message}`);
    return (data as AuditEventRow[]).map(rowToEvent);
}

export async function listRecentAudit(limit = 50): Promise<AuditEvent[]> {
    if (!isSupabaseEnabled("audit")) return devAudit.listRecentAudit(limit);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .order("at", { ascending: false })
        .limit(limit);
    if (error) throw new Error(`listRecentAudit: ${error.message}`);
    return (data as AuditEventRow[]).map(rowToEvent);
}
