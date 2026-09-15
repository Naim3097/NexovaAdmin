/**
 * DEV-ONLY local file store for PACKAGES — the standardised, fixed-price
 * managed-growth offerings (Growth, Scale). Replaced by the Supabase
 * `packages` table when USE_SUPABASE covers "packages".
 *
 * Packages are VERSIONED: a price or scope change publishes a new version and
 * retires the old one, so a client sold on Growth v1 keeps v1's terms while
 * new deals pick up v2. (code, version) is unique; at most one version per
 * code is active.
 *
 * Deliverables are the countable things fulfilment tracks per month
 * (ad set tests, posters, SEO articles…). Website and reporting cadence are
 * dedicated fields because they're not per-month quantities.
 *
 * "Ad set tests" is what the deck calls "ad creatives": each one is a campaign
 * ad set testing an audience, hook or format variable (Growth 8, Scale 16).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.join(process.cwd(), ".dev-data");
const PACKAGES_DIR = path.join(ROOT, "packages");

/** Countable monthly deliverables — the units quotas are expressed in. */
export const DELIVERABLE_TYPES = [
    "ad_set",
    "poster",
    "seo_article",
    "landing_page",
    "strategy_meeting",
    "content_post",
] as const;
export type DeliverableType = (typeof DELIVERABLE_TYPES)[number];

export const DELIVERABLE_LABELS: Record<DeliverableType, string> = {
    ad_set: "Ad set tests",
    poster: "Marketing posters",
    seo_article: "SEO blog articles",
    landing_page: "Campaign landing pages",
    strategy_meeting: "Strategy meetings",
    content_post: "Content posts",
};

export const ADS_PLATFORMS = ["meta", "google", "tiktok"] as const;
export type AdsPlatform = (typeof ADS_PLATFORMS)[number];
export const ADS_PLATFORM_LABELS: Record<AdsPlatform, string> = {
    meta: "Meta Ads (Facebook & Instagram)",
    google: "Google Ads",
    tiktok: "TikTok Ads",
};

export const REPORT_CADENCES = ["monthly", "weekly"] as const;
export type ReportCadence = (typeof REPORT_CADENCES)[number];

export type PackageDeliverable = {
    type: DeliverableType;
    qtyPerMonth: number;
};

export type Package = {
    id: string;
    /** Stable slug shared across versions, e.g. "growth". */
    code: string;
    name: string;
    version: number;
    /** Only the active version is offered on new deals. */
    active: boolean;
    /** "Perfect for" line from the deck. */
    tagline: string;
    monthlyFeeMyr: number;
    minimumTermMonths: number;
    platforms: AdsPlatform[];
    websiteIncluded: boolean;
    /** How the website line reads on quotes/agreements. */
    websiteLabel: string;
    reportCadence: ReportCadence;
    deliverables: PackageDeliverable[];
    /** Extra included items (one per line) — non-countable Schedule 1 lines. */
    includes: string;
    /** "Not included" bullets (one per line). */
    notIncluded: string;
    createdAt: string;
    updatedAt: string;
};

export type CreatePackageInput = Omit<
    Package,
    "id" | "version" | "active" | "createdAt" | "updatedAt"
> & { version?: number; active?: boolean };

/**
 * Seed from NEXOVA PRICING PACKAGE 2 (Sep 2026). Mirrored in
 * supabase/migrations/0027_packages.sql — keep both in sync.
 */
export const SEED_PACKAGES: CreatePackageInput[] = [
    {
        code: "growth",
        name: "Growth",
        tagline:
            "Businesses that already have products or services, but need a professional marketing team.",
        monthlyFeeMyr: 1500,
        minimumTermMonths: 6,
        platforms: ["meta"],
        websiteIncluded: true,
        websiteLabel:
            "FREE custom website (valued at RM5,000) — designed and built on the Nexova Platform during the first month",
        reportCadence: "monthly",
        deliverables: [
            { type: "ad_set", qtyPerMonth: 8 },
            { type: "poster", qtyPerMonth: 4 },
            { type: "strategy_meeting", qtyPerMonth: 2 },
        ],
        includes: [
            "Full Nexova CMS, AI website features, hosting & maintenance",
            "Unlimited content updates (fair use)",
            "Campaign setup and structure",
            "Audience research and targeting",
            "Ongoing campaign optimisation",
            "Professional copywriting for ads, posters and the website",
            "Full Nexova Premium subscription, AI Content Assistant, analytics dashboard",
            "Dedicated account manager",
            "WhatsApp Business support during business hours",
        ].join("\n"),
        notIncluded: [
            "Advertising spend (media budget) — paid by the client",
            "Domain name registration and renewal fees",
            "Photography, videography, video editing and motion graphics",
            "Influencer, KOL or affiliate fees",
            "Printing and production costs",
            "Premium stock media, fonts or third-party licences",
            "Additional creatives beyond the monthly quantities, or a website redesign after launch",
            "SST and other applicable taxes",
            "Google Ads, TikTok Ads, SEO services and blog content (Scale package)",
        ].join("\n"),
    },
    {
        code: "scale",
        name: "Scale",
        tagline:
            "Established SMEs looking for aggressive growth across multiple channels.",
        monthlyFeeMyr: 3000,
        minimumTermMonths: 6,
        platforms: ["meta", "google", "tiktok"],
        websiteIncluded: true,
        websiteLabel:
            "FREE premium custom website — with campaign landing pages and conversion optimisation, built on the Nexova Platform during the first month",
        reportCadence: "weekly",
        deliverables: [
            { type: "ad_set", qtyPerMonth: 16 },
            { type: "poster", qtyPerMonth: 8 },
            { type: "seo_article", qtyPerMonth: 4 },
            { type: "strategy_meeting", qtyPerMonth: 2 },
        ],
        includes: [
            "Everything in Growth",
            "Advanced AI features, conversion optimisation",
            "Monthly content calendar and campaign copywriting",
            "Technical & on-page SEO, local SEO, Google Business Profile optimisation",
            "KPI dashboard and ROI review",
            "Dedicated growth consultant with priority response",
            "Monthly growth planning session",
        ].join("\n"),
        notIncluded: [
            "Advertising spend (media budget) — paid by the client",
            "Domain name registration and renewal fees",
            "Photography, videography, video editing and motion graphics",
            "Influencer, KOL or affiliate fees",
            "Printing and production costs",
            "Premium stock media, fonts or third-party licences",
            "Additional creatives beyond the monthly quantities, or a website redesign after launch",
            "SST and other applicable taxes",
        ].join("\n"),
    },
];

async function ensureDir() {
    await fs.mkdir(PACKAGES_DIR, { recursive: true });
}

function fileFor(id: string) {
    return path.join(PACKAGES_DIR, `${id}.json`);
}

function build(input: CreatePackageInput): Package {
    const now = new Date().toISOString();
    return {
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
}

async function seedIfEmpty() {
    await ensureDir();
    const entries = (await fs.readdir(PACKAGES_DIR)).filter((e) =>
        e.endsWith(".json"),
    );
    if (entries.length > 0) return;
    for (const s of SEED_PACKAGES) {
        const p = build(s);
        await fs.writeFile(fileFor(p.id), JSON.stringify(p, null, 2), "utf8");
    }
}

export async function createPackage(input: CreatePackageInput): Promise<Package> {
    await ensureDir();
    const p = build(input);
    await fs.writeFile(fileFor(p.id), JSON.stringify(p, null, 2), "utf8");
    return p;
}

export async function listPackages(): Promise<Package[]> {
    await seedIfEmpty();
    const entries = await fs.readdir(PACKAGES_DIR);
    const out: Package[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const raw = await fs.readFile(path.join(PACKAGES_DIR, entry), "utf8");
        out.push(JSON.parse(raw) as Package);
    }
    return out.sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        if (a.code !== b.code) return a.monthlyFeeMyr - b.monthlyFeeMyr;
        return b.version - a.version;
    });
}

export async function getPackageById(id: string): Promise<Package | null> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        return JSON.parse(raw) as Package;
    } catch {
        return null;
    }
}

export async function updatePackage(
    id: string,
    patch: Partial<Omit<Package, "id" | "createdAt">>,
): Promise<Package> {
    const existing = await getPackageById(id);
    if (!existing) throw new Error(`Package ${id} not found`);
    const updated: Package = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(fileFor(id), JSON.stringify(updated, null, 2), "utf8");
    return updated;
}

export async function deletePackage(id: string): Promise<void> {
    try {
        await fs.unlink(fileFor(id));
    } catch {
        // ignore
    }
}
