"use server";

import { revalidatePath } from "next/cache";
import {
    type AgencyProfile,
    updateAgencyProfile,
} from "@/lib/data/agency";

function asStr(v: FormDataEntryValue | null): string {
    return typeof v === "string" ? v.trim() : "";
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
    revalidatePath("/settings/agency");
    revalidatePath("/settings");
    revalidatePath("/invoices");
}
