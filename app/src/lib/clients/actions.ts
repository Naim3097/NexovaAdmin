"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
    CLIENT_STATUSES,
    createClient,
    deleteClient,
    updateClient,
    type ClientStatus,
} from "@/lib/data/clients";

function asStatus(v: FormDataEntryValue | null): ClientStatus {
    const s = String(v ?? "");
    return (CLIENT_STATUSES as readonly string[]).includes(s)
        ? (s as ClientStatus)
        : "prospect";
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
    });
    revalidatePath(`/settings/clients/${id}`);
    revalidatePath("/settings/clients");
    revalidateTag("clients", "max");
}

export async function deleteClientAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deleteClient(id);
    revalidatePath("/settings/clients");
    revalidateTag("clients", "max");
    redirect("/settings/clients");
}
