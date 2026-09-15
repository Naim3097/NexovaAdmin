"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    ADS_PLATFORMS,
    DELIVERABLE_TYPES,
    REPORT_CADENCES,
    createPackage,
    deletePackage,
    publishNewVersion,
    updatePackage,
    type AdsPlatform,
    type CreatePackageInput,
    type DeliverableType,
    type PackageDeliverable,
    type ReportCadence,
} from "@/lib/data/packages";

function asInt(v: FormDataEntryValue | null, fallback = 0): number {
    const n = Math.round(Number(String(v ?? "")));
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function asMoney(v: FormDataEntryValue | null): number {
    const n = Number(String(v ?? "0"));
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

function asSlug(v: FormDataEntryValue | null): string {
    return String(v ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/** Shared form → input mapping for create / update / new-version. */
function packageFromForm(formData: FormData): CreatePackageInput {
    const platforms = formData
        .getAll("platforms")
        .map(String)
        .filter((p): p is AdsPlatform =>
            (ADS_PLATFORMS as readonly string[]).includes(p),
        );
    const deliverables: PackageDeliverable[] = DELIVERABLE_TYPES.map(
        (type: DeliverableType) => ({
            type,
            qtyPerMonth: asInt(formData.get(`deliverable_${type}`)),
        }),
    ).filter((d) => d.qtyPerMonth > 0);
    const cadence = String(formData.get("reportCadence") ?? "monthly");
    return {
        code: asSlug(formData.get("code")) || asSlug(formData.get("name")),
        name: String(formData.get("name") ?? "").trim(),
        tagline: String(formData.get("tagline") ?? "").trim(),
        monthlyFeeMyr: asMoney(formData.get("monthlyFeeMyr")),
        minimumTermMonths: asInt(formData.get("minimumTermMonths"), 6) || 6,
        platforms,
        websiteIncluded: String(formData.get("websiteIncluded") ?? "") === "on",
        websiteLabel: String(formData.get("websiteLabel") ?? "").trim(),
        reportCadence: (REPORT_CADENCES as readonly string[]).includes(cadence)
            ? (cadence as ReportCadence)
            : "monthly",
        deliverables,
        includes: String(formData.get("includes") ?? "").trim(),
        notIncluded: String(formData.get("notIncluded") ?? "").trim(),
    };
}

export async function createPackageAction(formData: FormData) {
    const input = packageFromForm(formData);
    if (!input.name) return;
    const p = await createPackage(input);
    revalidatePath("/settings/packages");
    redirect(`/settings/packages/${p.id}`);
}

/** Edits the version in place — for typo-level fixes. Price/scope changes
 * should go through publishNewVersionAction so sold deals keep their terms. */
export async function updatePackageAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const input = packageFromForm(formData);
    if (!input.name) return;
    await updatePackage(id, {
        ...input,
        active: String(formData.get("active") ?? "") === "on",
    });
    revalidatePath(`/settings/packages/${id}`);
    revalidatePath("/settings/packages");
}

export async function publishNewVersionAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const input = packageFromForm(formData);
    const next = await publishNewVersion(id, input);
    revalidatePath("/settings/packages");
    redirect(`/settings/packages/${next.id}`);
}

export async function deletePackageAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deletePackage(id);
    revalidatePath("/settings/packages");
    redirect("/settings/packages");
}
