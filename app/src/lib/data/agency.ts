/**
 * Agency profile data adapter (singleton row, id='nexov').
 *
 * `agency_profile` has a CHECK constraint enforcing id='nexov'. The migration
 * already inserts the row, so reads always succeed; we treat a missing row as
 * "fall back to DEFAULT_PROFILE" to match dev-store semantics.
 */
import { createServiceClient } from "@/lib/supabase/server";
import type { AgencyProfileRow, Database } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as devAgency from "@/lib/dev-store/agency";

export { DEFAULT_PROFILE, formatAddress } from "@/lib/dev-store/agency";
export type { AgencyProfile, BrandLogo } from "@/lib/dev-store/agency";

type AgencyProfile = devAgency.AgencyProfile;

/**
 * Resolve a document's `logoChoice` to the data URL to actually render:
 *   "" (or unknown id) → the agency's active logo
 *   "none"             → no logo (empty string)
 *   <logo id>          → that specific saved logo
 */
export function resolveDocumentLogo(
    choice: string,
    agency: AgencyProfile,
): string {
    if (choice === "none") return "";
    if (choice) {
        const found = agency.logos.find((l) => l.id === choice);
        if (found) return found.dataUrl;
    }
    return agency.logoUrl;
}

type AgencyInsert = Database["public"]["Tables"]["agency_profile"]["Insert"];

const TABLE = "agency_profile" as const;
const SINGLETON_ID = "nexov" as const;

function rowToProfile(row: AgencyProfileRow): AgencyProfile {
    return {
        legalName: row.legal_name,
        displayName: row.display_name,
        registrationNo: row.registration_no,
        sstNo: row.sst_no,
        email: row.email,
        phone: row.phone,
        websiteUrl: row.website_url,
        addressLine1: row.address_line1,
        addressLine2: row.address_line2,
        city: row.city,
        state: row.state,
        postcode: row.postcode,
        country: row.country,
        bankName: row.bank_name,
        bankAccountName: row.bank_account_name,
        bankAccountNo: row.bank_account_no,
        invoiceFooter: row.invoice_footer,
        logoUrl: row.logo_url ?? "",
        logos: Array.isArray(row.logos) ? row.logos : [],
        updatedAt: row.updated_at,
    };
}

function profileToUpsert(p: AgencyProfile): AgencyInsert {
    return {
        id: SINGLETON_ID,
        legal_name: p.legalName,
        display_name: p.displayName,
        registration_no: p.registrationNo,
        sst_no: p.sstNo,
        email: p.email,
        phone: p.phone,
        website_url: p.websiteUrl,
        address_line1: p.addressLine1,
        address_line2: p.addressLine2,
        city: p.city,
        state: p.state,
        postcode: p.postcode,
        country: p.country,
        bank_name: p.bankName,
        bank_account_name: p.bankAccountName,
        bank_account_no: p.bankAccountNo,
        invoice_footer: p.invoiceFooter,
        logo_url: p.logoUrl,
        logos: p.logos,
        updated_at: p.updatedAt,
    };
}

export async function getAgencyProfile(): Promise<AgencyProfile> {
    if (!isSupabaseEnabled("agency")) return devAgency.getAgencyProfile();
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("id", SINGLETON_ID)
        .maybeSingle();
    if (error) throw new Error(`getAgencyProfile: ${error.message}`);
    if (!data) return devAgency.DEFAULT_PROFILE;
    return rowToProfile(data as AgencyProfileRow);
}

export async function updateAgencyProfile(
    patch: Partial<Omit<AgencyProfile, "updatedAt">>,
): Promise<AgencyProfile> {
    if (!isSupabaseEnabled("agency")) return devAgency.updateAgencyProfile(patch);
    const current = await getAgencyProfile();
    const next: AgencyProfile = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .upsert(profileToUpsert(next), { onConflict: "id" })
        .select("*")
        .single();
    if (error) throw new Error(`updateAgencyProfile: ${error.message}`);
    return rowToProfile(data as AgencyProfileRow);
}
