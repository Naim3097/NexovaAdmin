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
        dealOwner: row.deal_owner ?? "",
        contactName: row.contact_name,
        contactEmail: row.contact_email,
        contactPhone: row.contact_phone,
        billingAddress: row.billing_address ?? "",
        website: row.website,
        industry: row.industry,
        notes: row.notes,
        contentRevisionLimit: row.content_revision_limit,
        portalToken: row.portal_token,
        userId: row.user_id,
        internal: row.internal ?? false,
        lastCheckInAt: row.last_check_in_at ?? "",
        lastCheckInNote: row.last_check_in_note ?? "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function clientToInsert(c: Client): ClientInsert {
    return {
        id: c.id,
        name: c.name,
        status: c.status,
        deal_owner: c.dealOwner,
        contact_name: c.contactName,
        contact_email: c.contactEmail,
        contact_phone: c.contactPhone,
        billing_address: c.billingAddress,
        website: c.website,
        industry: c.industry,
        notes: c.notes,
        content_revision_limit: c.contentRevisionLimit,
        portal_token: c.portalToken,
        user_id: c.userId,
        internal: c.internal,
        last_check_in_at: c.lastCheckInAt || null,
        last_check_in_note: c.lastCheckInNote,
        created_at: c.createdAt,
        updated_at: c.updatedAt,
    };
}

function patchToUpdate(patch: UpdatePatch): ClientUpdate {
    const out: ClientUpdate = {};
    if (patch.name !== undefined) out.name = patch.name;
    if (patch.status !== undefined) out.status = patch.status;
    if (patch.dealOwner !== undefined) out.deal_owner = patch.dealOwner;
    if (patch.contactName !== undefined) out.contact_name = patch.contactName;
    if (patch.contactEmail !== undefined)
        out.contact_email = patch.contactEmail;
    if (patch.contactPhone !== undefined)
        out.contact_phone = patch.contactPhone;
    if (patch.billingAddress !== undefined)
        out.billing_address = patch.billingAddress;
    if (patch.website !== undefined) out.website = patch.website;
    if (patch.industry !== undefined) out.industry = patch.industry;
    if (patch.notes !== undefined) out.notes = patch.notes;
    if (patch.contentRevisionLimit !== undefined)
        out.content_revision_limit = patch.contentRevisionLimit;
    if (patch.portalToken !== undefined) out.portal_token = patch.portalToken;
    if (patch.userId !== undefined) out.user_id = patch.userId;
    if (patch.internal !== undefined) out.internal = patch.internal;
    if (patch.lastCheckInAt !== undefined) out.last_check_in_at = patch.lastCheckInAt || null;
    if (patch.lastCheckInNote !== undefined) out.last_check_in_note = patch.lastCheckInNote;
    if (patch.updatedAt !== undefined) out.updated_at = patch.updatedAt;
    return out;
}

export async function createClient(input: {
    name: string;
    status?: ClientStatus;
    dealOwner?: string;
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
    internal?: boolean;
    lastCheckInAt?: string;
    lastCheckInNote?: string;
}): Promise<Client> {
    if (!isSupabaseEnabled("clients")) return devClients.createClient(input);
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

/**
 * Billing address for a client name (case-insensitive), or "" when nothing is
 * on file. Checks the client record first, then falls back to a matching LEAD
 * (deals often need a quote/deposit before the client record exists).
 * Used to prefill "Bill to" on new invoices/quotations.
 */
export async function billingAddressFor(clientName: string): Promise<string> {
    const name = clientName.trim().toLowerCase();
    if (!name) return "";
    try {
        const all = await listClients();
        const fromClient = all.find(
            (c) => c.name.trim().toLowerCase() === name,
        )?.billingAddress;
        if (fromClient) return fromClient;
        const { listLeads } = await import("@/lib/data/leads");
        const leads = await listLeads();
        return (
            leads.find(
                (l) =>
                    (l.company || l.name).trim().toLowerCase() === name &&
                    l.billingAddress,
            )?.billingAddress ?? ""
        );
    } catch {
        return "";
    }
}
