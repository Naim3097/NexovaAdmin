/**
 * Packages catalog data adapter — dispatches to the dev-store JSON files or
 * the Supabase `packages` table based on `isSupabaseEnabled("packages")`.
 *
 * Also home to the versioning rule: `publishNewVersion` clones a package as
 * version+1 (active) and retires the source, so existing deals keep the terms
 * they were sold on.
 */
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database, PackageRow } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as devPackages from "@/lib/dev-store/packages";

export {
    ADS_PLATFORMS,
    ADS_PLATFORM_LABELS,
    DELIVERABLE_LABELS,
    DELIVERABLE_TYPES,
    REPORT_CADENCES,
    SEED_PACKAGES,
} from "@/lib/dev-store/packages";
export type {
    AdsPlatform,
    CreatePackageInput,
    DeliverableType,
    Package,
    PackageDeliverable,
    ReportCadence,
} from "@/lib/dev-store/packages";

type Package = devPackages.Package;
type CreatePackageInput = devPackages.CreatePackageInput;
type UpdatePatch = Partial<Omit<Package, "id" | "createdAt">>;

type PackageInsert = Database["public"]["Tables"]["packages"]["Insert"];
type PackageUpdate = Database["public"]["Tables"]["packages"]["Update"];

const TABLE = "packages" as const;

function rowToPackage(row: PackageRow): Package {
    return {
        id: row.id,
        code: row.code,
        name: row.name,
        version: row.version,
        active: row.active,
        tagline: row.tagline,
        monthlyFeeMyr: Number(row.monthly_fee_myr),
        minimumTermMonths: row.minimum_term_months,
        platforms: (row.platforms ?? []) as Package["platforms"],
        websiteIncluded: row.website_included,
        websiteLabel: row.website_label,
        reportCadence: row.report_cadence as Package["reportCadence"],
        deliverables: (row.deliverables ?? []) as Package["deliverables"],
        includes: row.includes,
        notIncluded: row.not_included,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function packageToInsert(p: Package): PackageInsert {
    return {
        id: p.id,
        code: p.code,
        name: p.name,
        version: p.version,
        active: p.active,
        tagline: p.tagline,
        monthly_fee_myr: p.monthlyFeeMyr,
        minimum_term_months: p.minimumTermMonths,
        platforms: p.platforms,
        website_included: p.websiteIncluded,
        website_label: p.websiteLabel,
        report_cadence: p.reportCadence,
        deliverables: p.deliverables,
        includes: p.includes,
        not_included: p.notIncluded,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
    };
}

function patchToUpdate(patch: UpdatePatch): PackageUpdate {
    const out: PackageUpdate = {};
    if (patch.code !== undefined) out.code = patch.code;
    if (patch.name !== undefined) out.name = patch.name;
    if (patch.version !== undefined) out.version = patch.version;
    if (patch.active !== undefined) out.active = patch.active;
    if (patch.tagline !== undefined) out.tagline = patch.tagline;
    if (patch.monthlyFeeMyr !== undefined) out.monthly_fee_myr = patch.monthlyFeeMyr;
    if (patch.minimumTermMonths !== undefined)
        out.minimum_term_months = patch.minimumTermMonths;
    if (patch.platforms !== undefined) out.platforms = patch.platforms;
    if (patch.websiteIncluded !== undefined) out.website_included = patch.websiteIncluded;
    if (patch.websiteLabel !== undefined) out.website_label = patch.websiteLabel;
    if (patch.reportCadence !== undefined) out.report_cadence = patch.reportCadence;
    if (patch.deliverables !== undefined) out.deliverables = patch.deliverables;
    if (patch.includes !== undefined) out.includes = patch.includes;
    if (patch.notIncluded !== undefined) out.not_included = patch.notIncluded;
    if (patch.updatedAt !== undefined) out.updated_at = patch.updatedAt;
    return out;
}

function sortPackages(list: Package[]): Package[] {
    return list.sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        if (a.code !== b.code) return a.monthlyFeeMyr - b.monthlyFeeMyr;
        return b.version - a.version;
    });
}

export async function createPackage(input: CreatePackageInput): Promise<Package> {
    if (!isSupabaseEnabled("packages")) return devPackages.createPackage(input);
    const now = new Date().toISOString();
    const p: Package = {
        id: randomUUID(),
        code: input.code,
        name: input.name,
        version: input.version ?? 1,
        active: input.active ?? true,
        tagline: input.tagline,
        monthlyFeeMyr: input.monthlyFeeMyr,
        minimumTermMonths: input.minimumTermMonths,
        platforms: input.platforms,
        websiteIncluded: input.websiteIncluded,
        websiteLabel: input.websiteLabel,
        reportCadence: input.reportCadence,
        deliverables: input.deliverables,
        includes: input.includes,
        notIncluded: input.notIncluded,
        createdAt: now,
        updatedAt: now,
    };
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .insert(packageToInsert(p))
        .select("*")
        .single();
    if (error) throw new Error(`createPackage: ${error.message}`);
    return rowToPackage(data as PackageRow);
}

export async function listPackages(): Promise<Package[]> {
    if (!isSupabaseEnabled("packages")) return devPackages.listPackages();
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).select("*");
    if (error) throw new Error(`listPackages: ${error.message}`);
    return sortPackages((data as PackageRow[]).map(rowToPackage));
}

/** Only the versions currently offered on new deals. */
export async function listActivePackages(): Promise<Package[]> {
    return (await listPackages()).filter((p) => p.active);
}

export async function getPackageById(id: string): Promise<Package | null> {
    if (!isSupabaseEnabled("packages")) return devPackages.getPackageById(id);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(`getPackageById: ${error.message}`);
    return data ? rowToPackage(data as PackageRow) : null;
}

export async function updatePackage(id: string, patch: UpdatePatch): Promise<Package> {
    if (!isSupabaseEnabled("packages")) return devPackages.updatePackage(id, patch);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .update(patchToUpdate(patch))
        .eq("id", id)
        .select("*")
        .single();
    if (error) throw new Error(`updatePackage: ${error.message}`);
    return rowToPackage(data as PackageRow);
}

export async function deletePackage(id: string): Promise<void> {
    if (!isSupabaseEnabled("packages")) return devPackages.deletePackage(id);
    const sb = createServiceClient();
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deletePackage: ${error.message}`);
}

/**
 * Publish the next version of a package: clone `source` as version+1 with the
 * given overrides, mark it active, and retire every other version of the same
 * code. Deals already sold on the old version keep referencing it.
 */
export async function publishNewVersion(
    sourceId: string,
    overrides: Partial<CreatePackageInput>,
): Promise<Package> {
    const source = await getPackageById(sourceId);
    if (!source) throw new Error(`Package ${sourceId} not found`);
    const siblings = (await listPackages()).filter((p) => p.code === source.code);
    const nextVersion = Math.max(...siblings.map((p) => p.version)) + 1;

    const next = await createPackage({
        code: source.code,
        name: source.name,
        tagline: source.tagline,
        monthlyFeeMyr: source.monthlyFeeMyr,
        minimumTermMonths: source.minimumTermMonths,
        platforms: source.platforms,
        websiteIncluded: source.websiteIncluded,
        websiteLabel: source.websiteLabel,
        reportCadence: source.reportCadence,
        deliverables: source.deliverables,
        includes: source.includes,
        notIncluded: source.notIncluded,
        ...overrides,
        version: nextVersion,
        active: true,
    });
    for (const s of siblings) {
        if (s.active) await updatePackage(s.id, { active: false });
    }
    return next;
}

/** "16 FB/IG ad creatives · 8 marketing posters · …" for lists and documents. */
export function summarizeDeliverables(p: Package): string {
    return p.deliverables
        .filter((d) => d.qtyPerMonth > 0)
        .map((d) => `${d.qtyPerMonth} ${devPackages.DELIVERABLE_LABELS[d.type]}`)
        .join(" · ");
}
