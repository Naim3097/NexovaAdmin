"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
    CLIENT_STATUSES,
    createClient,
    deleteClient,
    getClientById,
    updateClient,
    type ClientStatus,
} from "@/lib/data/clients";
import { generateMonthlyPlan } from "@/lib/data/content";

function asStatus(v: FormDataEntryValue | null): ClientStatus {
    const s = String(v ?? "");
    return (CLIENT_STATUSES as readonly string[]).includes(s)
        ? (s as ClientStatus)
        : "prospect";
}

/** Parse a non-negative integer from a form field, clamped to a sane ceiling. */
function asCount(v: FormDataEntryValue | null, fallback: number): number {
    const n = Number.parseInt(String(v ?? ""), 10);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.min(n, 1000);
}

export async function createClientAction(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    const c = await createClient({
        name,
        status: asStatus(formData.get("status")),
        contactName: String(formData.get("contactName") ?? "").trim(),
        contactEmail: String(formData.get("contactEmail") ?? "").trim(),
        contactPhone: String(formData.get("contactPhone") ?? "").trim(),
        website: String(formData.get("website") ?? "").trim(),
        industry: String(formData.get("industry") ?? "").trim(),
        notes: String(formData.get("notes") ?? "").trim(),
    });
    revalidatePath("/settings/clients");
    revalidateTag("clients", "max");
    redirect(`/settings/clients/${c.id}`);
}

export async function updateClientAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await updateClient(id, {
        name: String(formData.get("name") ?? "").trim(),
        status: asStatus(formData.get("status")),
        contactName: String(formData.get("contactName") ?? "").trim(),
        contactEmail: String(formData.get("contactEmail") ?? "").trim(),
        contactPhone: String(formData.get("contactPhone") ?? "").trim(),
        website: String(formData.get("website") ?? "").trim(),
        industry: String(formData.get("industry") ?? "").trim(),
        notes: String(formData.get("notes") ?? "").trim(),
        contentRevisionLimit: asCount(formData.get("contentRevisionLimit"), 3),
        monthlyContentQuota: asCount(formData.get("monthlyContentQuota"), 0),
    });
    revalidatePath(`/settings/clients/${id}`);
    revalidatePath("/settings/clients");
    revalidateTag("clients", "max");
}

/** Issue (or re-issue) the client's portal link token. */
export async function generateClientPortalTokenAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await updateClient(id, { portalToken: randomUUID() });
    revalidatePath(`/settings/clients/${id}`);
    revalidateTag("clients", "max");
}

/**
 * Generate the client's content plan for a month from their monthly quota.
 * Idempotent per (client, month). Month defaults to the value the form sends.
 */
export async function generateContentPlanAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const month = String(formData.get("month") ?? "").trim();
    if (!id || !/^\d{4}-\d{2}$/.test(month)) return;
    const client = await getClientById(id);
    if (!client) return;
    await generateMonthlyPlan({
        clientName: client.name,
        month,
        quota: client.monthlyContentQuota,
    });
    revalidatePath(`/settings/clients/${id}`);
    revalidatePath("/content");
    revalidatePath("/content/calendar");
}

export async function deleteClientAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deleteClient(id);
    revalidatePath("/settings/clients");
    revalidateTag("clients", "max");
    redirect("/settings/clients");
}
