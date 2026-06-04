/**
 * DEV-ONLY local file store for the agency profile (singleton).
 * One JSON file at .dev-data/agency.json. Always returns a profile —
 * missing fields fall back to defaults so the rest of the app never
 * has to handle "no profile yet" branches.
 *
 * Replaced by Supabase `agency_profile` (single row, RLS allow-all
 * for now) once provisioned.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), ".dev-data");
const PROFILE_FILE = path.join(ROOT, "agency.json");

export type AgencyProfile = {
    legalName: string;
    displayName: string;
    registrationNo: string;
    sstNo: string;
    email: string;
    phone: string;
    websiteUrl: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
    bankName: string;
    bankAccountName: string;
    bankAccountNo: string;
    invoiceFooter: string;
    updatedAt: string;
};

export const DEFAULT_PROFILE: AgencyProfile = {
    legalName: "Nexov",
    displayName: "Nexov",
    registrationNo: "",
    sstNo: "",
    email: "",
    phone: "",
    websiteUrl: "https://nexovadmin.com",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postcode: "",
    country: "Malaysia",
    bankName: "",
    bankAccountName: "",
    bankAccountNo: "",
    invoiceFooter:
        "Thank you for your business. Payment due within 14 days of issue.",
    updatedAt: new Date(0).toISOString(),
};

async function ensureRoot() {
    await fs.mkdir(ROOT, { recursive: true });
}

export async function getAgencyProfile(): Promise<AgencyProfile> {
    try {
        const raw = await fs.readFile(PROFILE_FILE, "utf8");
        const parsed = JSON.parse(raw) as Partial<AgencyProfile>;
        return { ...DEFAULT_PROFILE, ...parsed };
    } catch {
        return DEFAULT_PROFILE;
    }
}

export async function updateAgencyProfile(
    patch: Partial<Omit<AgencyProfile, "updatedAt">>,
): Promise<AgencyProfile> {
    await ensureRoot();
    const current = await getAgencyProfile();
    const next: AgencyProfile = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(PROFILE_FILE, JSON.stringify(next, null, 2), "utf8");
    return next;
}

/** One-line address for invoice headers / CSV exports. */
export function formatAddress(p: AgencyProfile): string {
    return [
        p.addressLine1,
        p.addressLine2,
        [p.postcode, p.city].filter(Boolean).join(" "),
        p.state,
        p.country,
    ]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(", ");
}
