/**
 * Clients data adapter (single-table cutover).
 *
 * Note: dev-store function is `createClient` — name collides with the supabase
 * SSR helper of the same name. Callers import from `@/lib/data/clients` so
 * there's no runtime conflict, but inside this file we import the SSR helper
 * as `createServiceClient` only (no `createClient` SSR import here).
 */
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type { ClientRow, Database } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as devClients from "@/lib/dev-store/clients";

export { CLIENT_STATUSES } from "@/lib/dev-store/clients";
export type { Client, ClientStatus } from "@/lib/dev-store/clients";

type Client = devClients.Client;
type ClientStatus = devClients.ClientStatus;
type UpdatePatch = Partial<Omit<Client, "id" | "createdAt">>;

type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];
type ClientUpdate = Database["public"]["Tables"]["clients"]["Update"];

const TABLE = "clients" as const;

function rowToClient(row: ClientRow): Client {
    return {
        id: row.id,
        name: row.name,
        status: row.status as ClientStatus,
        contactName: row.contact_name,
        contactEmail: row.contact_email,
        contactPhone: row.contact_phone,
        website: row.website,
        industry: row.industry,
        notes: row.notes,
        contentRevisionLimit: row.content_revision_limit,
        monthlyContentQuota: row.monthly_content_quota,
        portalToken: row.portal_token,
        userId: row.user_id,
        extraContentPrice: Number(row.extra_content_price),
        extraRevisionPrice: Number(row.extra_revision_price),
        monthlyRetainerMyr: Number(row.monthly_retainer_myr),
        packageName: row.package_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function clientToInsert(c: Client): ClientInsert {
    return {
        id: c.id,
        name: c.name,
        status: c.status,
        contact_name: c.contactName,
        contact_email: c.contactEmail,
        contact_phone: c.contactPhone,
        website: c.website,
        industry: c.industry,
        notes: c.notes,
        content_revision_limit: c.contentRevisionLimit,
        monthly_content_quota: c.monthlyContentQuota,
        portal_token: c.portalToken,
        user_id: c.userId,
        extra_content_price: c.extraContentPrice,
        extra_revision_price: c.extraRevisionPrice,
        monthly_retainer_myr: c.monthlyRetainerMyr,
        package_name: c.packageName,
        created_at: c.createdAt,
        updated_at: c.updatedAt,
    };
}

function patchToUpdate(patch: UpdatePatch): ClientUpdate {
    const out: ClientUpdate = {};
    if (patch.name !== undefined) out.name = patch.name;
    if (patch.status !== undefined) out.status = patch.status;
    if (patch.contactName !== undefined) out.contact_name = patch.contactName;
    if (patch.contactEmail !== undefined)
        out.contact_email = patch.contactEmail;
    if (patch.contactPhone !== undefined)
        out.contact_phone = patch.contactPhone;
    if (patch.website !== undefined) out.website = patch.website;
    if (patch.industry !== undefined) out.industry = patch.industry;
    if (patch.notes !== undefined) out.notes = patch.notes;
    if (patch.contentRevisionLimit !== undefined)
        out.content_revision_limit = patch.contentRevisionLimit;
    if (patch.monthlyContentQuota !== undefined)
        out.monthly_content_quota = patch.monthlyContentQuota;
    if (patch.portalToken !== undefined) out.portal_token = patch.portalToken;
    if (patch.userId !== undefined) out.user_id = patch.userId;
    if (patch.extraContentPrice !== undefined)
        out.extra_content_price = patch.extraContentPrice;
    if (patch.extraRevisionPrice !== undefined)
        out.extra_revision_price = patch.extraRevisionPrice;
    if (patch.monthlyRetainerMyr !== undefined)
        out.monthly_retainer_myr = patch.monthlyRetainerMyr;
    if (patch.packageName !== undefined) out.package_name = patch.packageName;
    if (patch.updatedAt !== undefined) out.updated_at = patch.updatedAt;
    return out;
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
    extraContentPrice?: number;
    extraRevisionPrice?: number;
    monthlyRetainerMyr?: number;
    packageName?: string;
}): Promise<Client> {
    if (!isSupabaseEnabled("clients")) return devClients.createClient(input);
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
        extraContentPrice: input.extraContentPrice ?? 0,
        extraRevisionPrice: input.extraRevisionPrice ?? 0,
        monthlyRetainerMyr: input.monthlyRetainerMyr ?? 0,
        packageName: input.packageName ?? "",
        createdAt: now,
        updatedAt: now,
    };
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .insert(clientToInsert(c))
        .select("*")
        .single();
    if (error) throw new Error(`createClient: ${error.message}`);
    return rowToClient(data as ClientRow);
}

export async function listClients(): Promise<Client[]> {
    if (!isSupabaseEnabled("clients")) return devClients.listClients();
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .order("name", { ascending: true });
    if (error) throw new Error(`listClients: ${error.message}`);
    return (data as ClientRow[]).map(rowToClient);
}

export async function getClientById(id: string): Promise<Client | null> {
    if (!isSupabaseEnabled("clients")) return devClients.getClientById(id);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(`getClientById: ${error.message}`);
    return data ? rowToClient(data as ClientRow) : null;
}

export async function getClientByPortalToken(
    token: string,
): Promise<Client | null> {
    if (!token || token.length < 16) return null;
    if (!isSupabaseEnabled("clients")) {
        return devClients.getClientByPortalToken(token);
    }
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("portal_token", token)
        .maybeSingle();
    if (error) throw new Error(`getClientByPortalToken: ${error.message}`);
    return data ? rowToClient(data as ClientRow) : null;
}

export async function getClientByUserId(
    userId: string,
): Promise<Client | null> {
    if (!userId) return null;
    if (!isSupabaseEnabled("clients")) {
        return devClients.getClientByUserId(userId);
    }
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
    if (error) throw new Error(`getClientByUserId: ${error.message}`);
    return data ? rowToClient(data as ClientRow) : null;
}

export async function updateClient(
    id: string,
    patch: UpdatePatch,
): Promise<Client> {
    if (!isSupabaseEnabled("clients")) return devClients.updateClient(id, patch);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .update(patchToUpdate(patch))
        .eq("id", id)
        .select("*")
        .single();
    if (error) throw new Error(`updateClient: ${error.message}`);
    return rowToClient(data as ClientRow);
}

export async function deleteClient(id: string): Promise<void> {
    if (!isSupabaseEnabled("clients")) return devClients.deleteClient(id);
    const sb = createServiceClient();
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deleteClient: ${error.message}`);
}
