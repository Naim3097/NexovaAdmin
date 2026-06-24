"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
    type AgencyProfile,
    getAgencyProfile,
    updateAgencyProfile,
} from "@/lib/data/agency";
import type { BrandLogo } from "@/lib/dev-store/agency";

function asStr(v: FormDataEntryValue | null): string {
    return typeof v === "string" ? v.trim() : "";
}

function revalidateDocs() {
    revalidatePath("/settings/agency");
    revalidatePath("/settings");
    revalidatePath("/invoices");
    revalidatePath("/quotes");
}

export async function updateAgencyProfileAction(formData: FormData) {
    const patch: Partial<Omit<AgencyProfile, "updatedAt">> = {
        legalName: asStr(formData.get("legalName")),
        displayName: asStr(formData.get("displayName")),
        registrationNo: asStr(formData.get("registrationNo")),
        sstNo: asStr(formData.get("sstNo")),
        email: asStr(formData.get("email")),
        phone: asStr(formData.get("phone")),
        websiteUrl: asStr(formData.get("websiteUrl")),
        addressLine1: asStr(formData.get("addressLine1")),
        addressLine2: asStr(formData.get("addressLine2")),
        city: asStr(formData.get("city")),
        state: asStr(formData.get("state")),
        postcode: asStr(formData.get("postcode")),
        country: asStr(formData.get("country")),
        bankName: asStr(formData.get("bankName")),
        bankAccountName: asStr(formData.get("bankAccountName")),
        bankAccountNo: asStr(formData.get("bankAccountNo")),
        invoiceFooter: asStr(formData.get("invoiceFooter")),
    };
    await updateAgencyProfile(patch);
    revalidateDocs();
}

// ---- logo library -------------------------------------------------------
// Logos are stored as base64 data URLs (no Storage bucket needed). The active
// one (`logoUrl`) renders on quotes/invoices + their PDFs.

const MAX_LOGO_CHARS = 700_000; // ~500 KB image after base64 inflation

export async function addAgencyLogoAction(formData: FormData) {
    const dataUrl = asStr(formData.get("dataUrl"));
    const name = asStr(formData.get("name")) || "Logo";
    if (!dataUrl.startsWith("data:image/")) return;
    if (dataUrl.length > MAX_LOGO_CHARS) return;

    const profile = await getAgencyProfile();
    const logo: BrandLogo = { id: randomUUID(), name, dataUrl };
    const logos = [...profile.logos, logo];
    await updateAgencyProfile({
        logos,
        // First logo uploaded becomes the active one automatically.
        logoUrl: profile.logoUrl || dataUrl,
    });
    revalidateDocs();
}

export async function selectAgencyLogoAction(formData: FormData) {
    const logoId = asStr(formData.get("logoId"));
    if (!logoId) return;
    const profile = await getAgencyProfile();
    const logo = profile.logos.find((l) => l.id === logoId);
    if (!logo) return;
    await updateAgencyProfile({ logoUrl: logo.dataUrl });
    revalidateDocs();
}

export async function deleteAgencyLogoAction(formData: FormData) {
    const logoId = asStr(formData.get("logoId"));
    if (!logoId) return;
    const profile = await getAgencyProfile();
    const target = profile.logos.find((l) => l.id === logoId);
    if (!target) return;
    const logos = profile.logos.filter((l) => l.id !== logoId);
    await updateAgencyProfile({
        logos,
        // If we deleted the active logo, clear the selection.
        logoUrl: profile.logoUrl === target.dataUrl ? "" : profile.logoUrl,
    });
    revalidateDocs();
}

export async function clearAgencyLogoAction() {
    await updateAgencyProfile({ logoUrl: "" });
    revalidateDocs();
}
