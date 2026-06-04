"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    SERVICE_CATEGORIES,
    createService,
    deleteService,
    updateService,
    type ServiceCategory,
} from "@/lib/data/services";

function asCategory(v: FormDataEntryValue | null): ServiceCategory {
    const s = String(v ?? "");
    return (SERVICE_CATEGORIES as readonly string[]).includes(s)
        ? (s as ServiceCategory)
        : "other";
}

function asPrice(v: FormDataEntryValue | null): number {
    const n = Number(String(v ?? "0"));
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function createServiceAction(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    const s = await createService({
        name,
        category: asCategory(formData.get("category")),
        unit: String(formData.get("unit") ?? "project").trim() || "project",
        defaultPrice: asPrice(formData.get("defaultPrice")),
        description: String(formData.get("description") ?? "").trim(),
    });
    revalidatePath("/settings/services");
    redirect(`/settings/services/${s.id}`);
}

export async function updateServiceAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await updateService(id, {
        name: String(formData.get("name") ?? "").trim(),
        category: asCategory(formData.get("category")),
        unit: String(formData.get("unit") ?? "project").trim() || "project",
        defaultPrice: asPrice(formData.get("defaultPrice")),
        description: String(formData.get("description") ?? "").trim(),
        active: String(formData.get("active") ?? "") === "on",
    });
    revalidatePath(`/settings/services/${id}`);
    revalidatePath("/settings/services");
}

export async function deleteServiceAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deleteService(id);
    revalidatePath("/settings/services");
    redirect("/settings/services");
}
