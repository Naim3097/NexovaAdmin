/**
 * Services catalog data adapter (single-table cutover).
 */
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database, ServiceRow } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as devServices from "@/lib/dev-store/services";

export { SERVICE_CATEGORIES } from "@/lib/dev-store/services";
export type { Service, ServiceCategory } from "@/lib/dev-store/services";

type Service = devServices.Service;
type ServiceCategory = devServices.ServiceCategory;
type UpdatePatch = Partial<Omit<Service, "id" | "createdAt">>;

type ServiceInsert = Database["public"]["Tables"]["services"]["Insert"];
type ServiceUpdate = Database["public"]["Tables"]["services"]["Update"];

const TABLE = "services" as const;

function rowToService(row: ServiceRow): Service {
    return {
        id: row.id,
        name: row.name,
        category: row.category as ServiceCategory,
        unit: row.unit,
        defaultPrice: Number(row.default_price),
        description: row.description,
        active: row.active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function serviceToInsert(s: Service): ServiceInsert {
    return {
        id: s.id,
        name: s.name,
        category: s.category,
        unit: s.unit,
        default_price: s.defaultPrice,
        description: s.description,
        active: s.active,
        created_at: s.createdAt,
        updated_at: s.updatedAt,
    };
}

function patchToUpdate(patch: UpdatePatch): ServiceUpdate {
    const out: ServiceUpdate = {};
    if (patch.name !== undefined) out.name = patch.name;
    if (patch.category !== undefined) out.category = patch.category;
    if (patch.unit !== undefined) out.unit = patch.unit;
    if (patch.defaultPrice !== undefined)
        out.default_price = patch.defaultPrice;
    if (patch.description !== undefined) out.description = patch.description;
    if (patch.active !== undefined) out.active = patch.active;
    if (patch.updatedAt !== undefined) out.updated_at = patch.updatedAt;
    return out;
}

export async function createService(input: {
    name: string;
    category?: ServiceCategory;
    unit?: string;
    defaultPrice?: number;
    description?: string;
}): Promise<Service> {
    if (!isSupabaseEnabled("services")) return devServices.createService(input);
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
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .insert(serviceToInsert(s))
        .select("*")
        .single();
    if (error) throw new Error(`createService: ${error.message}`);
    return rowToService(data as ServiceRow);
}

export async function listServices(): Promise<Service[]> {
    if (!isSupabaseEnabled("services")) return devServices.listServices();
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).select("*");
    if (error) throw new Error(`listServices: ${error.message}`);
    return (data as ServiceRow[]).map(rowToService).sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}

export async function getServiceById(id: string): Promise<Service | null> {
    if (!isSupabaseEnabled("services")) return devServices.getServiceById(id);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(`getServiceById: ${error.message}`);
    return data ? rowToService(data as ServiceRow) : null;
}

export async function updateService(
    id: string,
    patch: UpdatePatch,
): Promise<Service> {
    if (!isSupabaseEnabled("services")) return devServices.updateService(id, patch);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .update(patchToUpdate(patch))
        .eq("id", id)
        .select("*")
        .single();
    if (error) throw new Error(`updateService: ${error.message}`);
    return rowToService(data as ServiceRow);
}

export async function deleteService(id: string): Promise<void> {
    if (!isSupabaseEnabled("services")) return devServices.deleteService(id);
    const sb = createServiceClient();
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deleteService: ${error.message}`);
}
