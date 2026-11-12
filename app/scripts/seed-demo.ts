/**
 * Demo seed for the LOCAL dev-store (.dev-data/) — never touches Supabase.
 *
 * Fills the sandbox with the agency as it really is: the eight people on the
 * team (their job roles, categories, set-aside hours, days off, cost rates)
 * and the eleven real clients, each with one project, its deliverables, the
 * tasks generated from them, the posts / campaigns / SEO articles those tasks
 * are done in, the invoices and the project costs. Fees, contacts and dates
 * are placeholders the owner edits; the shapes are what the Dashboard tabs
 * need to have something to say:
 *
 *   Delivery — this month a mix of done on time and late, in progress, in
 *              review (a client approval waiting 9 days, one 3 days, AM
 *              approvals), overdue (one ~20 days), waiting on the client and
 *              on us, a rework round, planned days pulled earlier, an open seat.
 *   Sales    — every pipeline stage, sent quotes, three lost deals with
 *              reasons, signings spread over the year, one signed this month.
 *   Money    — monthly invoices from each retainer's start, a draft, a slow
 *              NGO (two overdue), a past client 60+ days overdue, receipts this
 *              month, a half-billed one-off, ad spend / freelancer / software costs.
 *   Team     — Izzad and Bob over 100 %, Hakim under 60 %, days off.
 *   Clients  — check-ins, renewals (renewing, in talks, at risk, not discussed).
 *
 * Delivery is requirement-based: the account manager creates the project
 * with its DELIVERABLE rows ("8 static images a month, 1 campaign a month"),
 * a CREW (one person per seat) and the phases of a set, and the tasks are
 * generated from them (src/lib/contracts/generate.ts) with their linked post
 * / campaign / article. The seed drives that same path for last month, this
 * month and the next two (to keep the store small), then renames the generic
 * generated titles to realistic ones, moves rows onto the person who really
 * does them, and puts the tasks in their demo states. Invoices are raised
 * month by month from the project's billing.
 *
 * Usage (from app/):
 *   npm run seed:demo             # refuses if demo-owned data already exists
 *   npm run seed:demo -- --reset  # wipes the seeded entity folders first
 *
 * Only the entities it seeds are wiped on --reset (team, clients, leads,
 * quotations, sprint-tasks, content, invoices, campaigns, services,
 * contracts, works, seo-articles, project-templates — plus the retired
 * planners and phase-templates folders, if an older seed left them).
 * Onboarding, notifications, audit and uploads are left alone.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Module, { createRequire } from "node:module";

import * as team from "@/lib/dev-store/team";
import * as clients from "@/lib/dev-store/clients";
import * as leads from "@/lib/dev-store/leads";
import * as quotations from "@/lib/dev-store/quotations";
import * as sprint from "@/lib/dev-store/sprint-tasks";
import * as content from "@/lib/dev-store/content";
import * as invoices from "@/lib/dev-store/invoices";
import * as campaigns from "@/lib/dev-store/campaigns";
import * as services from "@/lib/dev-store/services";
import * as contracts from "@/lib/dev-store/contracts";
import * as projectTemplates from "@/lib/dev-store/project-templates";
import * as seo from "@/lib/dev-store/seo-articles";
import * as agency from "@/lib/dev-store/agency";
import type { BillingCadence, Contract, ContractStage, ContractStatus, Crew, Requirement } from "@/lib/dev-store/contracts";
import type { PlannerPhase } from "@/lib/dev-store/planners";
import { DEFAULT_SPLIT, type Approver, type LineType } from "@/lib/planners/vocab";
import type { Work, WorkPatch, WorkShare } from "@/lib/data/works";
import type { ServiceCategory } from "@/lib/dev-store/services";
import type { SetAside, SystemRole, TeamFunction, TeamMember } from "@/lib/dev-store/team";
import type { TeamCategory } from "@/lib/team/categories";
import type { ClientStatus } from "@/lib/dev-store/clients";
import { nearestWorkingDay, withHours } from "@/lib/capacity/helpers";
import type { LeadSource, LeadStatus } from "@/lib/dev-store/leads";
import type { Quotation, QuotationStatus } from "@/lib/dev-store/quotations";
import type { ContentPlatform, ContentReviewStatus, ContentStatus } from "@/lib/dev-store/content";
import type { CampaignPlatform } from "@/lib/dev-store/campaigns";
import type { InvoiceStatus } from "@/lib/dev-store/invoices";
import type { RenewalStatus } from "@/lib/contracts/renewal";
import type { CostKind, ProjectCost } from "@/lib/contracts/costs";
import type { LostReason } from "@/lib/leads/lost";
import type { WaitingOnKey } from "@/lib/works/waiting";

type HandShare = Omit<WorkShare, "hours"> & { hours?: number };

// --- .env.local → process.env (tsx doesn't do this) -------------------------
async function loadEnvLocal() {
    const file = path.join(process.cwd(), ".env.local");
    let raw: string;
    try {
        raw = await fs.readFile(file, "utf8");
    } catch {
        return;
    }
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        const hash = val.indexOf(" #");
        if (hash !== -1) val = val.slice(0, hash).trim();
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = val;
    }
}

// --- Modules that validate the environment on import ---------------------------
// The data adapters pull in src/lib/env.ts (via the Supabase client), which
// parses process.env the moment it loads — so these are imported only after
// .env.local is in place. Static imports would run first and fail.
let works: typeof import("@/lib/data/works");
let generate: typeof import("@/lib/contracts/generate");
let invoicing: typeof import("@/lib/contracts/invoicing");
let workHelpers: typeof import("@/lib/works/helpers");
/**
 * `server-only` is a marker Next's bundler resolves by itself; it is not an
 * installed package, so under tsx the data layer (which reaches it through
 * notifications → Telegram) cannot load. Point it at Next's own empty stub.
 */
function shimServerOnly() {
    const req = createRequire(path.join(process.cwd(), "package.json"));
    const empty = req.resolve("next/dist/compiled/server-only/empty");
    const loader = Module as unknown as { _resolveFilename: (this: unknown, request: string, ...rest: unknown[]) => string };
    const original = loader._resolveFilename;
    loader._resolveFilename = function (request: string, ...rest: unknown[]) {
        return request === "server-only" ? empty : original.call(this, request, ...rest);
    };
}
async function loadDataModules() {
    shimServerOnly();
    [works, generate, invoicing, workHelpers] = await Promise.all([
        import("@/lib/data/works"),
        import("@/lib/contracts/generate"),
        import("@/lib/contracts/invoicing"),
        import("@/lib/works/helpers"),
    ]);
}

// --- Dates ------------------------------------------------------------------------
// Everything is relative to the day the seed runs, so the demo keeps its shape.
const MS_DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
/** YYYY-MM-DD, `offset` days from today (negative = past). */
const ymd = (offset: number) => new Date(NOW + offset * MS_DAY).toISOString().slice(0, 10);
/** Full ISO timestamp, `offset` days from now. */
const iso = (offset: number) => new Date(NOW + offset * MS_DAY).toISOString();
const TODAY = ymd(0);
const MONTH = TODAY.slice(0, 7);
/** YYYY-MM, `n` months after `ym`. */
function monthPlus(ym: string, n: number): string {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
/** YYYY-MM `k` months from this one (negative = past). */
const M = (k: number) => monthPlus(MONTH, k);
const NEXT_MONTH = M(1);
/** Days from today to a YYYY-MM-DD (negative = past). */
const offsetOf = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${TODAY}T00:00:00Z`)) / MS_DAY);
/** YYYY-MM-DD for `day` of `ym`, clamped to the month. */
function dayOf(ym: string, day: number): string {
    const [y, m] = ym.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${ym}-${String(Math.max(1, Math.min(last, day))).padStart(2, "0")}`;
}
const endOf = (ym: string) => dayOf(ym, 31);
/** The later of two YYYY-MM-DD. */
const later = (a: string, b: string) => (a > b ? a : b);
/** The earlier of two YYYY-MM-DD. */
const earlier = (a: string, b: string) => (a < b ? a : b);
/** "Nov" for a YYYY-MM. */
function monShort(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-MY", { month: "short", timeZone: "UTC" });
}
/** "16 Nov" for the Monday of the week holding a YYYY-MM-DD. */
function weekOf(date: string): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toLocaleString("en-MY", { day: "numeric", month: "short", timeZone: "UTC" });
}

const ROOT = path.join(process.cwd(), ".dev-data");
const OWNED_DIRS = [
    "team",
    "clients",
    "leads",
    "quotations",
    "sprint-tasks",
    "content",
    "invoices",
    "campaigns",
    "services",
    "contracts",
    "works",
    "seo-articles",
    "project-templates",
];
/** Folders of retired features: wiped on --reset so stale records do not linger, never seeded. */
const LEGACY_DIRS = ["planners", "phase-templates"];

async function dirHasFiles(dir: string): Promise<boolean> {
    try {
        const entries = await fs.readdir(dir);
        return entries.some((e) => e.endsWith(".json"));
    } catch {
        return false;
    }
}

/** Merge fields straight into a stored record — for backdating timestamps the
 *  store APIs always set to "now". Local JSON only. */
async function patchJson(dir: string, id: string, patch: Record<string, unknown>) {
    const file = path.join(ROOT, dir, `${id}.json`);
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
    await fs.writeFile(file, JSON.stringify({ ...raw, ...patch }, null, 2), "utf8");
}

// --- Team -------------------------------------------------------------------
// SYSTEM roles are permissions (admin / management / user); DUTIES are the
// pages handed out (delivery, finance). The job role is free text; the
// category maps a person to task seats. Set-aside rows are the hours a week
// that leave no task behind; delivery capacity is the 32-hour week minus them.
// Hours per task type and cost rates are placeholders the owner edits.
const TEAM: Array<{
    name: string;
    role: string;
    category: TeamCategory;
    skills: string;
    systemRoles: SystemRole[];
    functions: TeamFunction[];
    setAside: SetAside[];
    hours: Partial<Record<LineType, number>>;
    /** Internal hourly cost (MYR) behind project margin. */
    costRate: number;
    /** Days off per month, taken off that month's capacity. */
    daysOff?: Record<string, number>;
}> = [
    {
        name: "Naim",
        role: "Chief Executive Officer",
        category: "closer",
        skills: "strategy, sales, client relations",
        systemRoles: ["admin", "management"],
        functions: ["delivery"],
        setAside: [{ label: "Sales", hours: 10 }, { label: "Management", hours: 10 }],
        hours: { custom: 2, static: 2, video: 5, campaign: 6, seo: 4, website: 8 },
        costRate: 150,
    },
    {
        name: "Danisy",
        role: "Chief Technical Officer",
        category: "dm",
        skills: "performance marketing, analytics, tracking, martech",
        systemRoles: ["management"],
        functions: ["delivery"],
        setAside: [{ label: "Management", hours: 8 }],
        hours: { campaign: 6, seo: 4, static: 2, video: 5, custom: 1.5, website: 8 },
        costRate: 130,
    },
    {
        name: "Izzad",
        role: "Creative Director",
        category: "creative",
        skills: "art direction, brand design, video editing",
        systemRoles: ["management"],
        functions: ["delivery"],
        setAside: [{ label: "Management", hours: 6 }],
        hours: { static: 2, video: 6, custom: 2, campaign: 6, seo: 4, website: 8 },
        costRate: 110,
        daysOff: { [MONTH]: 2 },
    },
    {
        name: "Zafran",
        role: "Head of Digital Infrastructure",
        category: "developer",
        skills: "web development, hosting, payment integrations",
        systemRoles: ["management"],
        functions: ["delivery"],
        setAside: [{ label: "Management", hours: 6 }],
        hours: { website: 10, custom: 2, static: 2, video: 5, campaign: 6, seo: 4 },
        costRate: 110,
    },
    {
        name: "Yusuf",
        role: "Head of Business Operations",
        category: "closer",
        skills: "operations, finance, sales, reporting",
        systemRoles: ["admin", "management"],
        functions: ["delivery", "finance"],
        setAside: [
            { label: "Management", hours: 8 },
            { label: "Sales", hours: 6 },
            { label: "Operations", hours: 6 },
            { label: "Finance review", hours: 4 },
        ],
        hours: { custom: 2, static: 2, video: 5, campaign: 6, seo: 4, website: 8 },
        costRate: 130,
    },
    {
        name: "Hakim",
        role: "Head of Account Management",
        category: "am",
        skills: "account management, community, copywriting, reporting",
        systemRoles: ["management"],
        functions: ["delivery"],
        setAside: [{ label: "Client calls", hours: 6 }, { label: "Management", hours: 4 }],
        hours: { custom: 2, static: 2, video: 5, campaign: 6, seo: 4, website: 8 },
        costRate: 100,
        daysOff: { [M(2)]: 3 },
    },
    {
        name: "Bob",
        role: "Digital Marketer",
        category: "dm",
        skills: "Meta Ads, content, short-form video, SEO",
        systemRoles: ["user"],
        functions: ["delivery"],
        setAside: [],
        hours: { campaign: 5, seo: 3, static: 1.75, video: 4.5, custom: 1.5, website: 8 },
        costRate: 45,
        daysOff: { [NEXT_MONTH]: 1 },
    },
    {
        // Contracts, invoices, payments, quotations, onboarding: finance only, no delivery capacity.
        name: "Farisha",
        role: "Admin and Business Support",
        category: "business_support",
        skills: "contracts, invoicing, payments, quotations, onboarding",
        systemRoles: ["user"],
        functions: ["finance"],
        setAside: [
            { label: "Invoicing & payments", hours: 12 },
            { label: "Contracts & quotations", hours: 8 },
            { label: "Onboarding", hours: 6 },
            { label: "Admin", hours: 6 },
        ],
        hours: { custom: 1 },
        costRate: 40,
    },
];

const item = (description: string, unitPriceMyr: number, quantity = 1) => ({
    id: randomUUID(),
    description,
    details: "",
    quantity,
    unitPriceMyr,
});

async function seedInvoice(input: {
    clientName: string;
    contractId?: string | null;
    issueDate: string;
    dueDate: string;
    items: ReturnType<typeof item>[];
    status: InvoiceStatus;
    /** Days after issue the invoice was paid (paid only). */
    paidAfterDays?: number;
}) {
    const inv = await invoices.createInvoice({
        clientName: input.clientName,
        contractId: input.contractId ?? null,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
    });
    await invoices.updateInvoice(inv.id, {
        items: input.items,
        status: input.status,
        paidAt: input.status === "paid" ? iso(Math.min(0, offsetOf(input.issueDate) + (input.paidAfterDays ?? 7))) : null,
    });
    await patchJson("invoices", inv.id, { createdAt: iso(Math.min(0, offsetOf(input.issueDate))) });
    return inv;
}

/**
 * Raise the monthly invoices of a retainer from its billing, up to the
 * current month: past months paid, this month as given (sent, or a draft
 * still being prepared). `overrides` changes single months (an NGO's unpaid
 * months, a payment that landed late). Later months are raised when they
 * come. Returns how many it raised.
 */
async function settleMonthInvoices(
    c: Contract,
    months: string[],
    thisMonth: InvoiceStatus,
    overrides: Record<string, { status: InvoiceStatus; paidAfterDays?: number }> = {},
): Promise<number> {
    let n = 0;
    for (const [i, month] of months.entries()) {
        if (month > MONTH) break;
        const inv = await invoicing.raiseMonthInvoice(c, month);
        if (!inv) continue;
        const o = overrides[month];
        const status: InvoiceStatus = o?.status ?? (month < MONTH ? "paid" : thisMonth);
        const after = o?.paidAfterDays ?? 5 + (i % 4) * 3;
        await invoices.updateInvoice(inv.id, {
            status,
            paidAt: status === "paid" ? iso(Math.min(0, offsetOf(inv.issueDate) + after)) : null,
        });
        await patchJson("invoices", inv.id, { createdAt: iso(Math.min(offsetOf(inv.issueDate), 0)) });
        n += 1;
    }
    return n;
}

/** A project cost row; dated no later than today. */
function cost(label: string, kind: CostKind, amountMyr: number, date: string, addedBy: string): ProjectCost {
    return { id: randomUUID(), label, kind, amountMyr, date: earlier(date, TODAY), addedBy };
}

// --- Realistic titles for the generated tasks ------------------------------------
// One pool per deliverable row; the seed rotates through it month by month.
const T = {
    kartiniStatic: [
        "Carousel: 5 signs your eczema needs a specialist",
        "Static: Sunscreen myths, busted",
        "Carousel: Acne scars — what actually works",
        "Static: Cruelty-free skincare, explained",
        "Carousel: Skin barrier 101",
        "Static: Adopt, don't shop — Dr Kartini's rescue story",
        "Carousel: Pigmentation in Malaysian skin",
        "Static: Consultation FAQ",
        "Carousel: Ingredients to avoid in pregnancy",
        "Static: Stray feeding drive this weekend",
        "Carousel: Hair loss — when to see a dermatologist",
        "Static: Clinic hours and booking",
    ],
    kartiniVideo: [
        "Reel: A day at the clinic",
        "TikTok: Dermatologist reacts to viral skincare hacks",
        "Reel: Why I speak up for animals",
        "TikTok: The 30-second sunscreen guide",
        "Reel: Patient Q&A — psoriasis",
        "TikTok: Skincare on a budget",
    ],
    kartiniSeo: [
        "Eczema treatment in Malaysia: what to expect",
        "How to choose a dermatologist in Kuala Lumpur",
        "Cruelty-free skincare you can buy in Malaysia",
        "Acne scar treatments compared",
        "Sun protection for a tropical climate",
        "Hair loss in women: causes and treatment",
    ],
    rouangStatic: [
        "Carousel: Before & after — Bangsar condo",
        "Static: 3 layout ideas for small kitchens",
        "Carousel: Project showcase — Shah Alam terrace",
        "Static: Quartz vs granite worktops",
        "Carousel: A renovation timeline, step by step",
        "Static: Client testimonial — Puchong semi-D",
        "Carousel: Built-in wardrobe ideas",
        "Static: Book a free site consultation",
        "Carousel: Budgeting your renovation",
    ],
    rouangVideo: [
        "Reel: Site walkthrough — Mont Kiara unit",
        "Reel: Time-lapse kitchen install",
        "TikTok: Renovation mistakes to avoid",
        "Reel: Handover day",
        "TikTok: How we plan a renovation",
    ],
    baitulCampaign: [
        "Donation campaign: Wakaf one brick",
        "Donation campaign: Jumaat infaq drive",
        "Donation campaign: Surau roof fund",
        "Donation campaign: Jumaat infaq drive",
        "Donation campaign: Year-end sadaqah appeal",
        "Donation campaign: Jumaat infaq drive",
        "Donation campaign: Wudhu area fund",
        "Donation campaign: Jumaat infaq drive",
    ],
    baitulStatic: [
        "Poster: Wakaf one brick, RM 50",
        "Static: Progress update — roof frame up",
        "Poster: Infaq Jumaat this week",
        "Static: Thank you, donors",
        "Poster: Sponsor a prayer mat",
        "Static: How your donation is used",
        "Poster: Scan to give — QR donation",
        "Static: Gotong-royong volunteer call",
    ],
    baitulVideo: ["Video: Surau construction progress", "Video: The imam's message to donors", "Video: Gotong-royong highlights", "Video: Where your wakaf goes"],
    digitalVideo: [
        "Founder video: Why we started LeanX Digital",
        "Founder video: What a retainer really costs",
        "Founder video: How we plan a month of content",
        "Founder video: Agency or freelancer?",
        "Founder video: Lessons from our clients this year",
        "Founder video: Our plans for next year",
    ],
    digitalStatic: [
        "LinkedIn: Client win — Tropicor",
        "LinkedIn: We are hiring a designer",
        "LinkedIn: Case study — Zakat for Gen Z",
        "LinkedIn: What we learned this quarter",
        "LinkedIn: Behind the scenes of a shoot",
        "LinkedIn: How we report to clients",
    ],
    digitalSeo: [
        "What a digital marketing retainer costs in Malaysia",
        "How to brief an agency in one page",
        "A content calendar template for SMEs",
        "Meta or Google ads: where to start",
        "How NGOs can raise donations online",
        "Short-form video for B2B brands",
    ],
    payrightStatic: [
        "Carousel: How Payright payouts work",
        "Static: Merchant spotlight",
        "Carousel: 5 ways to cut payment failures",
        "Static: New — instant settlement",
        "Carousel: Payment links vs QR",
        "Static: Security you can trust",
        "Carousel: Month-end recap",
        "Static: Fee calculator",
        "Carousel: E-invoicing checklist",
        "Static: Customer testimonial",
        "Carousel: Accept cards in a day",
        "Static: Q&A from the inbox",
    ],
    payrightVideo: ["Reel: Merchant story — a bakery in Klang", "Reel: Payright in 30 seconds", "TikTok: Payment myths", "Reel: Behind the dashboard"],
    payrightSeo: [
        "How online payments work for Malaysian SMEs",
        "Payment gateway fees compared",
        "E-invoicing: what merchants must know",
        "Reducing failed transactions at checkout",
        "Subscription billing for small businesses",
        "Chargebacks explained",
        "QR payments vs cards: a merchant's guide",
        "Cross-border payments 101",
    ],
    leanxStatic: [
        "Carousel: LeanX for online sellers",
        "Static: Collect payments with one link",
        "Carousel: FPX explained",
        "Static: Merchant of the month",
        "Carousel: Cashflow tips for SMEs",
        "Static: Next-day payouts",
        "Carousel: Fraud protection basics",
        "Static: Integrations we support",
        "Carousel: Case study — a café chain",
        "Static: Product update",
    ],
    leanxVideo: ["Reel: Founder story", "TikTok: Set up a payment link in 60 seconds", "Reel: Customer testimonial", "Reel: Product update", "TikTok: A day with a merchant"],
    leanxSeo: [
        "How FPX payments work for Malaysian SMEs",
        "Choosing a payment gateway",
        "The cashless café playbook",
        "Payment security checklist for SMEs",
        "Merchant onboarding checklist",
        "Reconciliation made simple",
    ],
    leanisStatic: [
        "LinkedIn: Leanis at a glance",
        "Carousel: Lean operations in 5 steps",
        "Static: Client success story",
        "Carousel: Digitalise your SOPs",
        "Static: Meet the team",
        "Carousel: A cost-saving checklist",
        "Static: Webinar invite",
        "Carousel: Automation quick wins",
    ],
    leanisVideo: ["Reel: What Leanis does in 30 seconds", "Reel: Client interview", "Reel: Office tour", "Reel: Founder Q&A"],
    leanisSeo: [
        "Lean management for Malaysian SMEs",
        "How to digitalise your SOPs",
        "Process automation: where to start",
        "Cutting operating costs without cutting people",
    ],
    zakatTiktok: [
        "TikTok: Zakat in 30 seconds",
        "TikTok: Who receives zakat?",
        "TikTok: Zakat on your first salary",
        "TikTok: Gen Z asks the ustaz",
        "TikTok: Zakat vs sedekah",
        "TikTok: Paying zakat online, step by step",
        "TikTok: Myth — zakat is only for Ramadan",
        "TikTok: Where your zakat goes",
        "TikTok: Zakat on savings, explained",
        "TikTok: A day in the life of an amil",
    ],
    zakatReel: ["Reel: Campus zakat roadshow", "Reel: Asnaf stories", "Reel: Zakat calculator walkthrough", "Reel: Your zakat at work"],
    zakatStatic: [
        "Infographic: Zakat calculator basics",
        "Infographic: The 8 asnaf explained",
        "Infographic: Zakat on gold and savings",
        "Infographic: Pay with your e-wallet",
        "Infographic: Zakat by the numbers",
        "Infographic: Fitrah vs harta",
    ],
    enfrasysStatic: [
        "LinkedIn: Enfrasys at a glance",
        "LinkedIn: Cloud migration in 5 steps",
        "LinkedIn: Security tip of the week",
        "LinkedIn: Customer story",
        "LinkedIn: Meet the engineers",
        "LinkedIn: Modern workplace checklist",
        "LinkedIn: Event recap",
        "LinkedIn: Data governance basics",
    ],
    enfrasysVideo: ["Video: Explainer — cloud cost control", "Video: Customer interview", "Video: Explainer — zero trust in 60 seconds", "Video: Behind the helpdesk"],
    tropicorMeta: [
        "Meta campaign: Festive gift boxes",
        "Meta campaign: Retargeting — cart abandoners",
        "Meta campaign: New flavour launch",
        "Meta campaign: Lookalike prospecting",
    ],
    tropicorGoogle: ["Google Ads: Brand search", "Google Ads: Shopping — best sellers", "Google Ads: Performance Max", "Google Ads: Search — gifting terms"],
    tropicorStatic: ["Ad creative: Festive bundle", "Ad creative: Free delivery offer", "Ad creative: Product close-up", "Ad creative: Customer review", "Ad creative: Limited flavour"],
};

/** Channel → the platform of the post / campaign record it is done in. */
function contentPlatform(channel: string): ContentPlatform {
    const c = channel.toLowerCase();
    if (c.includes("tiktok")) return "tiktok";
    if (c.includes("facebook")) return "facebook";
    if (c.includes("linkedin")) return "linkedin";
    if (c.includes("youtube")) return "youtube";
    if (c.includes("blog")) return "blog";
    return "instagram";
}
function campaignPlatform(channel: string): CampaignPlatform {
    const c = channel.toLowerCase();
    if (c.includes("google")) return "google";
    if (c.includes("tiktok")) return "tiktok";
    if (c.includes("linkedin")) return "linkedin";
    return "meta";
}

/**
 * The phase sets the demo projects are laid out with. `work` is the phase the
 * repeating deliverables (posts, videos, campaigns, articles) sit in.
 */
const PHASE_SETS: Record<string, { work: string; phases: Array<{ key: string; name: string; summary: string }> }> = {
    "Social retainer": {
        work: "production",
        phases: [
            { key: "kickoff", name: "Kickoff", summary: "Onboarding, brand audit, access, strategy sign-off." },
            { key: "foundation", name: "Foundation", summary: "Brand kit, content pillars and account setup." },
            { key: "production", name: "Production", summary: "Monthly statics, videos, campaigns and articles." },
            { key: "review", name: "Review", summary: "Performance review, renewal proposal, next plan." },
        ],
    },
    "Donation drive": {
        work: "drives",
        phases: [
            { key: "kickoff", name: "Kickoff", summary: "Committee briefing, donation channels, tracking." },
            { key: "appeal", name: "Appeal launch", summary: "Launch posters, the donation link and the first campaign." },
            { key: "drives", name: "Monthly drives", summary: "Donation campaigns, posters and progress videos." },
            { key: "review", name: "Review", summary: "Donor report, results and the next appeal." },
        ],
    },
    "Campaign management": {
        work: "optimise",
        phases: [
            { key: "setup", name: "Setup", summary: "Ad accounts, tracking, audiences, first creatives." },
            { key: "launch", name: "Launch", summary: "First campaigns live, budgets split by channel." },
            { key: "optimise", name: "Optimise", summary: "Weekly optimisation, fresh creatives, monthly report." },
            { key: "review", name: "Review", summary: "Results review and the next quarter's plan." },
        ],
    },
    "Website build": {
        work: "build",
        phases: [
            { key: "discovery", name: "Discovery", summary: "Requirements, sitemap, content inventory." },
            { key: "design", name: "Design", summary: "Wireframes, visual design, client sign-off." },
            { key: "build", name: "Build", summary: "Development, donation flow, integrations, content entry." },
            { key: "qa-launch", name: "QA & launch", summary: "Testing, fixes, go-live and handover." },
        ],
    },
};

/** A phase set with month ranges filled in (indexes into `months`; negative = from the end). */
function phasesFromSet(setName: string, months: string[], ranges: Record<string, [number, number]>): PlannerPhase[] {
    const set = PHASE_SETS[setName];
    if (!set) throw new Error(`No phase set "${setName}"`);
    const last = months.length - 1;
    const at = (i: number) => months[Math.max(0, Math.min(last, i < 0 ? last + 1 + i : i))];
    return set.phases.map((ph) => {
        const r = ranges[ph.key];
        return r ? { ...ph, startMonth: at(r[0]), endMonth: at(r[1]) } : { ...ph, startMonth: "", endMonth: "" };
    });
}

// --- Work states ----------------------------------------------------------------
type WorkState =
    /** `lateDays`: finished that many days after the due date (else the day before it). */
    | { status: "completed"; doneDaysAgo?: number; lateDays?: number }
    /** `dueDaysAgo`: move the deadline to that many days ago (an old task still open). */
    | { status: "in_progress"; startedDaysAgo?: number; changes?: string; revisions?: number; waiting?: WaitingOnKey; waitingDays?: number; dueDaysAgo?: number }
    | { status: "pending_approval"; submittedDaysAgo?: number }
    | { status: "not_started"; overdue?: boolean; moveDays?: number; waiting?: WaitingOnKey; waitingDays?: number; dueDaysAgo?: number };

/**
 * Put a task (and the post / campaign / article it is linked to) in a state.
 * Tasks are visible to their owners from the moment they exist; no briefing step.
 */
async function setWorkState(w: Work, s: WorkState) {
    const am = w.accountManager;
    const url = `https://drive.example.com/work/${w.id.slice(0, 8)}`;
    let started: number | null = null;
    const patch: WorkPatch = { status: s.status };
    switch (s.status) {
        case "completed": {
            const done =
                s.doneDaysAgo !== undefined
                    ? -s.doneDaysAgo
                    : s.lateDays !== undefined
                      ? Math.min(offsetOf(w.dueDate) + s.lateDays, 0)
                      : Math.min(offsetOf(w.dueDate) - 1, -1);
            started = done - 5;
            const reviewed = w.approver !== "none";
            patch.startedAt = iso(started);
            patch.submittedAt = reviewed ? iso(done - 1) : null;
            patch.submission = reviewed ? { url, note: "Final version attached." } : { url: "", note: "" };
            patch.review = reviewed
                ? { decision: "approved", note: "", by: w.approver === "client" ? `Client (via ${am})` : am, at: iso(done) }
                : { decision: null, note: "", by: "", at: null };
            patch.completedAt = iso(done);
            break;
        }
        case "in_progress": {
            started = -(s.startedDaysAgo ?? 3);
            patch.startedAt = iso(started);
            if (s.changes) {
                patch.submittedAt = iso(-2);
                patch.submission = { url, note: "Draft 1" };
                patch.review = { decision: "changes", note: s.changes, by: am, at: iso(-1) };
            }
            break;
        }
        case "pending_approval": {
            const submitted = -(s.submittedDaysAgo ?? 1);
            started = submitted - 4;
            patch.startedAt = iso(started);
            patch.submittedAt = iso(submitted);
            patch.submission = { url, note: "Ready for review." };
            break;
        }
        case "not_started": {
            if (s.overdue && w.dueDate >= TODAY) {
                // Past due even when the seed runs early in the month.
                const d = ymd(-2) < `${w.month}-01` ? `${w.month}-01` : ymd(-2);
                patch.dueDate = d;
                patch.defaultDueDate = d;
            }
            if (s.moveDays) {
                patch.dueDate = workHelpers.shiftYmd(w.dueDate, s.moveDays);
                patch.adjustedBy = am;
                patch.adjustedAt = iso(-2);
            }
            break;
        }
    }
    if ((s.status === "in_progress" || s.status === "not_started") && s.dueDaysAgo !== undefined) {
        patch.dueDate = ymd(-s.dueDaysAgo);
        patch.defaultDueDate = patch.dueDate;
    }
    // Blocked on someone: the owner marked it from the quick edit.
    if ("waiting" in s && s.waiting) {
        patch.waitingOn = s.waiting;
        patch.waitingSince = iso(-(s.waitingDays ?? 3));
    }
    const next = await works.updateWork(w.id, patch);
    await syncLinked(next, s);
    return next;
}

/** Mirror a task's state onto the record it is done in (post / reel / campaign / article). */
async function syncLinked(w: Work, s: WorkState) {
    if (!w.linked) return;
    if (w.linked.kind === "content") {
        const changes = s.status === "in_progress" && Boolean(s.changes);
        const status: ContentStatus =
            w.status === "completed" ? "posted" : w.status === "pending_approval" ? "review" : w.status === "in_progress" ? "draft" : "idea";
        const review: ContentReviewStatus =
            w.status === "completed" ? "approved" : w.status === "pending_approval" && w.approver === "client" ? "awaiting_client" : changes ? "changes_requested" : "none";
        await content.updateContentPost(w.linked.id, {
            status,
            reviewStatus: review,
            scheduledFor: w.dueDate,
            visualHeadline: status === "idea" ? "" : w.title,
            postedAt: w.status === "completed" ? w.completedAt : null,
            approvedAt: w.status === "completed" ? w.review.at : null,
            approvedBy: w.status === "completed" ? (w.approver === "client" ? "Client" : w.review.by) : "",
            revisionsUsed: s.status === "in_progress" ? (s.revisions ?? (changes ? 1 : 0)) : 0,
        });
        return;
    }
    if (w.linked.kind === "campaign") {
        await campaigns.updateCampaign(w.linked.id, {
            status: w.status === "completed" ? "ended" : w.status === "not_started" ? "planning" : "live",
            endDate: w.status === "completed" ? w.dueDate : "",
        });
        return;
    }
    if (w.linked.kind === "seo") {
        await seo.updateSeoArticle(w.linked.id, {
            stage: w.status === "completed" ? "published" : w.status === "pending_approval" ? "review" : w.status === "in_progress" ? "draft" : "brief",
            publishedAt: w.status === "completed" ? w.completedAt : null,
        });
    }
}

/**
 * The state a task is in when the demo says nothing special about it: last
 * month's work done, this month's done when its date has passed and in hand
 * when it is due in the next few days, later work not started.
 */
function defaultState(w: Work): WorkState | null {
    if (w.month > MONTH) return null;
    if (w.dueDate < TODAY) return { status: "completed" };
    if (w.dueDate <= ymd(4)) return { status: "in_progress", startedDaysAgo: 2 };
    return null;
}

// --- Shaping the generated tasks ---------------------------------------------------
/**
 * What the seed changes on a generated task so the demo reads like a real
 * engagement: the title (and the linked record's), the channel, a move to
 * another month for one-off items, the due date, the phase, the people on it.
 */
type Shape = {
    title: string;
    channel?: string;
    /** YYYY-MM to move the task to (one-off items land in the first month by default). */
    month?: string;
    dueDay?: number;
    /** Exact due date (wins over `dueDay`). */
    dueDate?: string;
    /** Phase key on the contract. */
    phase?: string;
    split?: HandShare[];
    approver?: Approver;
    milestone?: boolean;
    state?: WorkState;
};

async function shapeWork(c: Contract, w: Work, s: Shape, teamList: TeamMember[]): Promise<Work> {
    const month = s.month ?? w.month;
    const dueDate = s.dueDate
        ? s.dueDate
        : s.dueDay
          ? workHelpers.dateForDay(month, s.dueDay)
          : s.month
            ? workHelpers.dateForDay(month, Number(w.dueDate.slice(8, 10)))
            : w.dueDate;
    const channel = s.channel ?? w.channel;
    const phase = s.phase ? c.phases.find((ph) => ph.key === s.phase) : undefined;
    const patch: WorkPatch = {
        title: s.title,
        channel,
        month,
        dueDate,
        defaultDueDate: dueDate,
    };
    if (phase) {
        patch.phaseKey = phase.key;
        patch.phaseName = phase.name;
    }
    if (s.split) patch.split = withHours(s.split, teamList, w.type);
    if (s.approver) patch.approver = s.approver;
    if (s.milestone !== undefined) patch.milestone = s.milestone;
    let next = await works.updateWork(w.id, patch);
    const assignee = workHelpers.primaryMember(next);
    if (next.linked?.kind === "content") {
        await content.updateContentPost(next.linked.id, { title: s.title, platform: contentPlatform(channel), scheduledFor: dueDate, planMonth: month, assignee });
    } else if (next.linked?.kind === "campaign") {
        await campaigns.updateCampaign(next.linked.id, { name: s.title, platform: campaignPlatform(channel), startDate: dueDate });
    } else if (next.linked?.kind === "seo") {
        await seo.updateSeoArticle(next.linked.id, { title: s.title, targetDate: dueDate, assignee });
    }
    if (s.state) next = await setWorkState(next, s.state);
    return next;
}

/** A deliverable row as the seed writes it: the stored row plus how its tasks are dressed. */
type RowSpec = Requirement & {
    /** Who holds this row's tasks when it is not the crew member of the type's seat. */
    who?: string;
    /** Titles to rotate through, month by month; else the row name with the month or week. */
    titles?: string[];
    /** Channels to alternate between (Instagram / TikTok). */
    channels?: string[];
    approver?: Approver;
    /** Fixed day of the month (a strategy call on the 3rd), moved to the nearest working day. */
    dueDay?: number;
    /** Phase key; repeating rows default to the set's working phase. */
    phase?: string;
};

type ProjectSpec = {
    name: string;
    clientName: string;
    am: string;
    startDate: string;
    /** YYYY-MM-DD, "" = open-ended. */
    endDate: string;
    status?: ContractStatus;
    stage?: ContractStage;
    /** YYYY-MM-DD, null = not signed. */
    signedAt: string | null;
    quoteKey?: string;
    reference?: string;
    value: number;
    terms: string;
    cadence: BillingCadence;
    amount: number;
    invoiceDay?: number;
    /** Phase set (PHASE_SETS) the phases come from, and their month ranges (indexes into the project months; negative = from the end). */
    template: string;
    ranges: Record<string, [number, number]>;
    rows: RowSpec[];
    crew: Crew;
    /** Our own company's project: approved by management, no signed copy, no money. */
    internal?: boolean;
    /** Project template it started from (Settings → Templates). */
    templateName?: string;
    renewalStatus?: RenewalStatus;
    costs?: ProjectCost[];
};

/** One generated task: its deliverable row, its number in the month, the month it was generated in. */
type TaskRef = { ri: number; nth: number; gen: string; w: Work };
type Seeded = { spec: ProjectSpec; c: Contract; months: string[]; tasks: TaskRef[] };

/** Every month the project runs; open-ended ones to two months ahead. */
function projectMonths(spec: Pick<ProjectSpec, "startDate" | "endDate">): string[] {
    const start = spec.startDate.slice(0, 7);
    const end = spec.endDate ? spec.endDate.slice(0, 7) : later(M(2), start);
    const out: string[] = [];
    for (let m = start; m <= end && out.length < 24; m = monthPlus(m, 1)) out.push(m);
    return out;
}

/** "Instagram post · 8/mo, Brand item · 2 once" — for the printed summary. */
function requirementsLabel(c: Contract): string {
    return contracts.requirementsLabel(c.requirements, ", ");
}

async function main() {
    await loadEnvLocal();
    const mode = (process.env.USE_SUPABASE ?? "0").trim().toLowerCase();
    if (!["", "0", "false", "off"].includes(mode)) {
        console.error(
            `Refusing to run: USE_SUPABASE="${mode}". This seed only targets the local .dev-data store. Set USE_SUPABASE=0 in app/.env.local first.`,
        );
        process.exit(1);
    }
    process.env.USE_SUPABASE = "0";
    await loadDataModules();

    const reset = process.argv.includes("--reset");
    const existing: string[] = [];
    for (const d of OWNED_DIRS) {
        if (await dirHasFiles(path.join(ROOT, d))) existing.push(d);
    }
    if (existing.length > 0 && !reset) {
        console.error(
            `Found existing data in .dev-data/{${existing.join(",")}}. Re-run with --reset to replace it:\n  npm run seed:demo -- --reset`,
        );
        process.exit(1);
    }
    if (reset) {
        for (const d of [...OWNED_DIRS, ...LEGACY_DIRS]) {
            await fs.rm(path.join(ROOT, d), { recursive: true, force: true });
        }
        console.log(`Cleared .dev-data/{${OWNED_DIRS.join(",")}}`);
    }

    // ---- Services catalog (same 9 as scripts/seed.ts) ------------------------
    const SERVICES: Array<{ name: string; category: ServiceCategory; unit: string; price: number }> = [
        { name: "Website Creation", category: "website", unit: "project", price: 8000 },
        { name: "App Development", category: "app", unit: "project", price: 30000 },
        { name: "Social Media Management", category: "content", unit: "month", price: 2500 },
        { name: "META Ads", category: "ads", unit: "month", price: 1500 },
        { name: "Google Ads", category: "ads", unit: "month", price: 1500 },
        { name: "Google SEO", category: "seo", unit: "month", price: 2000 },
        { name: "Google My Business", category: "seo", unit: "month", price: 600 },
        { name: "Brand Development & Kit", category: "branding", unit: "project", price: 5000 },
        { name: "Business Operation System", category: "retainer", unit: "project", price: 20000 },
    ];
    for (const s of SERVICES) {
        await services.createService({
            name: s.name,
            category: s.category,
            unit: s.unit,
            defaultPrice: s.price,
            description: "",
        });
    }

    // ---- Project templates (Starter / Growth / Scale): months + deliverable rows + phase rows ----
    for (const s of projectTemplates.STARTER_PROJECT_TEMPLATES) {
        await projectTemplates.createProjectTemplate(s);
    }

    // ---- Agency: the monthly sales target the Sales dashboard measures against ----
    await agency.updateAgencyProfile({ salesTargetMyr: 40000 });

    // ---- Team ---------------------------------------------------------------
    for (const m of TEAM) {
        await team.createTeamMember({
            name: m.name,
            role: m.role,
            category: m.category,
            email: `${m.name.toLowerCase().replace(/\s+/g, ".")}@nexova.local`,
            skills: m.skills,
            systemRoles: m.systemRoles,
            functions: m.functions,
            weeklyHours: 32,
            setAside: m.setAside,
            hoursByType: m.hours,
            costRateMyr: m.costRate,
            daysOff: m.daysOff,
        });
    }
    const teamList = await team.listTeamMembers();

    // ---- When each project was signed (the Sales trend reads these) ---------------
    // Spread over the year so several months have signings; Enfrasys is this month's.
    const ENFRASYS_START = later(`${MONTH}-01`, ymd(-3));
    const SIGNED = {
        leanx: dayOf(M(-11), 22),
        payright: dayOf(M(-9), 25),
        kartini: dayOf(M(-6), 28),
        zakat: dayOf(M(-5), 3),
        rouang: dayOf(M(-5), 26),
        digital: dayOf(M(-4), 1),
        baitul: dayOf(M(-4), 29),
        leanis: dayOf(M(-3), 27),
        tropicor: dayOf(M(-2), 29),
        kembara: dayOf(M(-1), 1),
        enfrasys: later(`${MONTH}-01`, ymd(-9)),
        sutera: dayOf(M(-11), 28),
        paklong: dayOf(M(-7), 24),
    };
    const ago = (date: string) => Math.max(0, -offsetOf(date));

    // ---- Clients ------------------------------------------------------------
    // `closer` = the deal owner, who closed the deal; the project carries its own account manager.
    const CLIENTS: Array<{
        name: string;
        status: ClientStatus;
        closer: string;
        industry: string;
        notes: string;
        /** Days ago the client record was created (when the deal was won). */
        since: number;
        /** Days ago of the last check-in; absent = never logged. */
        checkIn?: number;
        checkInNote?: string;
        internal?: boolean;
    }> = [
        { name: "Dr Kartini", status: "active", closer: "Naim", industry: "Healthcare (dermatology)", notes: "Growing Dr Kartini's brand as a dermatologist consultant, with advocacy on animal rights.", since: ago(SIGNED.kartini), checkIn: 10, checkInNote: "Renewal call: wants to keep the advocacy series and asked for a 12-month price." },
        { name: "Rouang", status: "active", closer: "Yusuf", industry: "Interior design & renovation", notes: "Interior design contractor.", since: ago(SIGNED.rouang), checkIn: 36, checkInNote: "Site visit at the Mont Kiara project. Unhappy with lead quality from Meta; reviewing options before renewal." },
        { name: "Baitul Irfan", status: "active", closer: "Naim", industry: "Non-profit (surau)", notes: "NGO raising donations for a surau; marketing to get donations.", since: ago(SIGNED.baitul), checkIn: 4, checkInNote: "Committee meeting: approved the roof fund appeal. September and October invoices wait on the treasurer's sign-off." },
        { name: "LeanX Digital", status: "active", closer: "", industry: "Digital marketing agency", notes: "Our own company: growing our own brand.", since: 420, internal: true },
        { name: "Payright", status: "active", closer: "Yusuf", industry: "Fintech (payments)", notes: "Growing the brand.", since: ago(SIGNED.payright), checkIn: 5, checkInNote: "Monthly review: merchant sign-ups up 18 %, wants more video." },
        { name: "LeanX", status: "active", closer: "Naim", industry: "Fintech (payments)", notes: "Growing the brand.", since: ago(SIGNED.leanx), checkIn: 3, checkInNote: "Renewal for next year agreed in principle; paperwork next week." },
        { name: "Leanis Solution Sdn Bhd", status: "active", closer: "Yusuf", industry: "Business solutions", notes: "Growing the brand.", since: ago(SIGNED.leanis), checkIn: 12, checkInNote: "Quarterly review: happy with LinkedIn reach, wants a webinar push." },
        { name: "Zakat Selangor", status: "active", closer: "Naim", industry: "Religious body (zakat)", notes: "Growing awareness of zakat for Gen Z.", since: ago(SIGNED.zakat), checkIn: 7, checkInNote: "Board update: the TikTok series is landing with students; asked for more campus content." },
        { name: "Kembara", status: "active", closer: "Yusuf", industry: "Non-profit (donations)", notes: "A one-off website for donations.", since: ago(SIGNED.kembara), checkIn: 2, checkInNote: "Build check-in: payment gateway sandbox approved, launch date holding." },
        // Signed this month; nobody has logged a check-in yet.
        { name: "Enfrasys", status: "active", closer: "Naim", industry: "IT services", notes: "Content creation.", since: ago(SIGNED.enfrasys) },
        { name: "Tropicor", status: "active", closer: "Yusuf", industry: "Consumer goods", notes: "Campaign management.", since: ago(SIGNED.tropicor), checkIn: 6, checkInNote: "Weekly ads call: ROAS 3.1 on Meta; testing new gifting search terms on Google." },
        // History: a paused retainer and a churned one-off (fictional names).
        { name: "Sutera Batik Studio", status: "paused", closer: "Yusuf", industry: "Fashion retail", notes: "Past client: social media retainer, paused.", since: ago(SIGNED.sutera), checkIn: 95, checkInNote: "Paused until the next Raya collection is ready." },
        { name: "Pak Long Kopitiam", status: "churned", closer: "Naim", industry: "Food & beverage", notes: "Past client: website and menu revamp.", since: ago(SIGNED.paklong), checkIn: 70, checkInNote: "Project closed. Final invoice still unpaid; owner not answering." },
    ];
    for (const c of CLIENTS) {
        const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const row = await clients.createClient({
            name: c.name,
            status: c.status,
            dealOwner: c.closer,
            internal: c.internal ?? false,
            contentRevisionLimit: 3,
            industry: c.industry,
            notes: c.notes,
            contactName: "Demo contact",
            contactEmail: `${slug}@example.com`,
        });
        await patchJson("clients", row.id, {
            createdAt: iso(-c.since),
            lastCheckInAt: c.checkIn !== undefined ? ymd(-c.checkIn) : "",
            lastCheckInNote: c.checkInNote ?? "",
        });
    }

    // ---- Leads (pipeline) ------------------------------------------------------
    // "proposal" is a plain pipeline stage: the deal is priced on a quotation
    // and waiting on the client. Won deals are the clients above.
    const LEADS: Array<{
        name: string;
        company: string;
        status: LeadStatus;
        value: number;
        owner: string;
        /** Last touch (the decision day for won and lost deals). */
        touchedDaysAgo: number;
        /** When it arrived. */
        createdDaysAgo: number;
        score: number;
        source: LeadSource;
        interest: string;
        auto?: boolean;
        lost?: LostReason;
        lostNote?: string;
    }> = [
        // Won: the real clients, decided the day the project was signed.
        { name: "LeanX contact", company: "LeanX", status: "won", value: 96000, owner: "Naim", touchedDaysAgo: ago(SIGNED.leanx), createdDaysAgo: ago(SIGNED.leanx) + 30, score: 90, source: "referral", interest: "Social media, video, SEO, Meta ads" },
        { name: "Payright contact", company: "Payright", status: "won", value: 90000, owner: "Yusuf", touchedDaysAgo: ago(SIGNED.payright), createdDaysAgo: ago(SIGNED.payright) + 28, score: 88, source: "linkedin", interest: "Brand growth retainer" },
        { name: "Dr Kartini", company: "Dr Kartini", status: "won", value: 36000, owner: "Naim", touchedDaysAgo: ago(SIGNED.kartini), createdDaysAgo: ago(SIGNED.kartini) + 21, score: 85, source: "instagram", interest: "Personal brand, short-form video, SEO" },
        { name: "Zakat Selangor contact", company: "Zakat Selangor", status: "won", value: 120000, owner: "Naim", touchedDaysAgo: ago(SIGNED.zakat), createdDaysAgo: ago(SIGNED.zakat) + 45, score: 92, source: "event", interest: "TikTok and Reels for Gen Z, awareness campaign" },
        { name: "Rouang contact", company: "Rouang", status: "won", value: 27000, owner: "Yusuf", touchedDaysAgo: ago(SIGNED.rouang), createdDaysAgo: ago(SIGNED.rouang) + 18, score: 74, source: "website", interest: "Social media, Meta lead-gen" },
        { name: "Baitul Irfan contact", company: "Baitul Irfan", status: "won", value: 15000, owner: "Naim", touchedDaysAgo: ago(SIGNED.baitul), createdDaysAgo: ago(SIGNED.baitul) + 20, score: 70, source: "referral", interest: "Donation campaigns" },
        { name: "Leanis contact", company: "Leanis Solution Sdn Bhd", status: "won", value: 24000, owner: "Yusuf", touchedDaysAgo: ago(SIGNED.leanis), createdDaysAgo: ago(SIGNED.leanis) + 24, score: 76, source: "linkedin", interest: "LinkedIn, social media, SEO" },
        { name: "Tropicor contact", company: "Tropicor", status: "won", value: 57000, owner: "Yusuf", touchedDaysAgo: ago(SIGNED.tropicor), createdDaysAgo: ago(SIGNED.tropicor) + 26, score: 86, source: "google", interest: "Meta and Google campaign management" },
        { name: "Kembara contact", company: "Kembara", status: "won", value: 18000, owner: "Yusuf", touchedDaysAgo: ago(SIGNED.kembara), createdDaysAgo: ago(SIGNED.kembara) + 22, score: 80, source: "referral", interest: "Donation website" },
        { name: "Enfrasys contact", company: "Enfrasys", status: "won", value: 33000, owner: "Naim", touchedDaysAgo: ago(SIGNED.enfrasys), createdDaysAgo: ago(SIGNED.enfrasys) + 19, score: 84, source: "linkedin", interest: "LinkedIn content, explainer videos" },
        { name: "Sutera Batik contact", company: "Sutera Batik Studio", status: "won", value: 12500, owner: "Yusuf", touchedDaysAgo: ago(SIGNED.sutera), createdDaysAgo: ago(SIGNED.sutera) + 15, score: 72, source: "instagram", interest: "Social media management" },
        { name: "Pak Long contact", company: "Pak Long Kopitiam", status: "won", value: 9500, owner: "Naim", touchedDaysAgo: ago(SIGNED.paklong), createdDaysAgo: ago(SIGNED.paklong) + 12, score: 68, source: "facebook", interest: "Website, menu revamp" },
        // Quoted, waiting on the client (each has a sent quote below).
        { name: "Rohani Salleh", company: "Rumah Kebajikan Kasih Murni", status: "proposal", value: 18000, owner: "Naim", touchedDaysAgo: 5, createdDaysAgo: 24, score: 78, source: "tiktok", interest: "Fundraising campaigns, video" },
        { name: "Faizal Hamdan", company: "Kopi Tanah Tinggi", status: "proposal", value: 21000, owner: "Yusuf", touchedDaysAgo: 12, createdDaysAgo: 30, score: 66, source: "cold_outreach", interest: "Social media, TikTok" },
        // Qualified (a draft quote is being prepared for the tahfiz school).
        { name: "Hilmi Rahman", company: "Sekolah Tahfiz Al-Hikmah", status: "qualified", value: 14000, owner: "Naim", touchedDaysAgo: 4, createdDaysAgo: 16, score: 64, source: "referral", interest: "Donation website, Meta ads" },
        { name: "Lim Mei Yee", company: "Klinik Pergigian Senyum", status: "qualified", value: 10800, owner: "Yusuf", touchedDaysAgo: 10, createdDaysAgo: 25, score: 58, source: "website", interest: "Local SEO, Google Business Profile" },
        // Contacted.
        { name: "Arif Zain", company: "Klinik Haiwan Sri Hartamas", status: "contacted", value: 9000, owner: "Naim", touchedDaysAgo: 2, createdDaysAgo: 6, score: 52, source: "instagram", interest: "Social media management" },
        { name: "Tan Ah Seng", company: "Bengkel Kereta Ah Seng", status: "contacted", value: 4500, owner: "Yusuf", touchedDaysAgo: 1, createdDaysAgo: 5, score: 45, source: "facebook", interest: "Meta ads" },
        // New, nobody on them yet: one is three days old (missed its first touch), one came in today.
        { name: "Esah Ramli", company: "Kedai Roti Mak Esah", status: "new", value: 3000, owner: "", touchedDaysAgo: 3, createdDaysAgo: 3, score: 35, source: "website", interest: "Website" },
        { name: "Amir Hakimi", company: "Persatuan Belia Taman Melati", status: "new", value: 0, owner: "", touchedDaysAgo: 0, createdDaysAgo: 0, score: 20, source: "facebook", interest: "", auto: true },
        // Lost, with the reason.
        { name: "Nur Ayu Kamal", company: "Butik Nur Ayu", status: "lost", value: 6000, owner: "Yusuf", touchedDaysAgo: 20, createdDaysAgo: 48, score: 40, source: "instagram", interest: "Social media management", lost: "price", lostNote: "Went with a freelancer at half our monthly fee." },
        { name: "Rizal Jaya", company: "Bengkel Motor Jaya", status: "lost", value: 4500, owner: "Naim", touchedDaysAgo: 35, createdDaysAgo: 60, score: 42, source: "facebook", interest: "Meta ads", lost: "no_response", lostNote: "Three follow-ups over two weeks, no reply." },
        { name: "Kevin Ong", company: "Hartanah Prima Realty", status: "lost", value: 30000, owner: "Yusuf", touchedDaysAgo: 55, createdDaysAgo: 90, score: 60, source: "linkedin", interest: "Property listings, video, Meta ads", lost: "competitor", lostNote: "Signed with a larger property-marketing agency." },
    ];
    for (const l of LEADS) {
        const slug = l.company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const row = await leads.createLead({
            name: l.name,
            company: l.company,
            email: `${slug}@example.com`,
            source: l.source,
            interestedIn: l.interest,
            estValueMyr: l.value,
            assignedTo: l.owner,
            score: l.score,
            autoIntake: l.auto ?? false,
        });
        await patchJson("leads", row.id, {
            status: l.status,
            createdAt: iso(-l.createdDaysAgo),
            updatedAt: iso(-l.touchedDaysAgo),
            lostReason: l.lost ?? "",
            lostNote: l.lostNote ?? "",
        });
    }

    // ---- Quotations (the price behind the recent projects, plus open quotes) ----
    const QUOTES: Array<{
        key: string;
        clientName: string;
        subject: string;
        status: QuotationStatus;
        issueDaysAgo: number;
        validDays: number;
        acceptedDaysAgo?: number;
        total: number;
    }> = [
        { key: "leanis", clientName: "Leanis Solution Sdn Bhd", subject: "Brand growth retainer — 6 months", status: "accepted", issueDaysAgo: ago(SIGNED.leanis) + 9, validDays: 14, acceptedDaysAgo: ago(SIGNED.leanis) + 1, total: 24000 },
        { key: "tropicor", clientName: "Tropicor", subject: "Campaign management — 6 months, ad budget included", status: "accepted", issueDaysAgo: ago(SIGNED.tropicor) + 10, validDays: 14, acceptedDaysAgo: ago(SIGNED.tropicor) + 2, total: 57000 },
        { key: "kembara", clientName: "Kembara", subject: "Donation website — design and build", status: "accepted", issueDaysAgo: ago(SIGNED.kembara) + 12, validDays: 14, acceptedDaysAgo: ago(SIGNED.kembara) + 3, total: 18000 },
        { key: "enfrasys", clientName: "Enfrasys", subject: "Content creation retainer — 6 months", status: "accepted", issueDaysAgo: ago(SIGNED.enfrasys) + 8, validDays: 14, acceptedDaysAgo: ago(SIGNED.enfrasys) + 1, total: 33000 },
        { key: "kasih-murni", clientName: "Rumah Kebajikan Kasih Murni", subject: "Fundraising campaigns and video — 6 months", status: "sent", issueDaysAgo: 5, validDays: 14, total: 18000 },
        { key: "kopi", clientName: "Kopi Tanah Tinggi", subject: "Social media and TikTok — 6 months", status: "sent", issueDaysAgo: 12, validDays: 14, total: 21000 },
        { key: "tahfiz", clientName: "Sekolah Tahfiz Al-Hikmah", subject: "Donation website and Meta ads setup", status: "draft", issueDaysAgo: 1, validDays: 30, total: 14000 },
        { key: "nur-ayu", clientName: "Butik Nur Ayu", subject: "Social media management — 3 months", status: "declined", issueDaysAgo: 30, validDays: 14, total: 6000 },
    ];
    const quoteByKey: Record<string, Quotation> = {};
    for (const q of QUOTES) {
        const row = await quotations.createQuotation({
            clientName: q.clientName,
            issueDate: ymd(-q.issueDaysAgo),
            validUntil: ymd(-q.issueDaysAgo + q.validDays),
        });
        quoteByKey[q.key] = await quotations.updateQuotation(row.id, {
            subject: q.subject,
            items: [item(q.subject, q.total)],
            status: q.status,
            acceptedAt: q.acceptedDaysAgo !== undefined ? iso(-q.acceptedDaysAgo) : null,
        });
        await patchJson("quotations", row.id, { createdAt: iso(-q.issueDaysAgo) });
    }

    // ---- Projects: deliverable rows + crew + phases → generated tasks ---------------
    /** Only last month, this month and the next two get tasks, to keep the store small. */
    const GEN_FROM = M(-1);
    const GEN_TO = M(2);

    async function seedProject(spec: ProjectSpec): Promise<Seeded> {
        const months = projectMonths(spec);
        const genMonths = months.filter((m) => m >= GEN_FROM && m <= GEN_TO);
        const quote = spec.quoteKey ? quoteByKey[spec.quoteKey] : null;
        const c = await contracts.createContract({
            name: spec.name,
            clientName: spec.clientName,
            accountManager: spec.am,
            startDate: spec.startDate,
            endDate: spec.endDate,
            status: spec.status ?? "active",
            stage: spec.stage ?? (spec.signedAt ? "delivering" : "created"),
            phases: phasesFromSet(spec.template, months, spec.ranges),
            requirements: spec.rows.map(({ type, name, count, per, channel }) => ({ type, name, count, per, channel })),
            crew: spec.crew,
            reference: spec.reference ?? quote?.number ?? "",
            quotationId: quote?.id ?? null,
            valueMyr: spec.value,
            signedAt: spec.signedAt,
            signedBy: spec.signedAt ? (spec.internal ? "Management" : "Client director") : "",
            fileUrl: spec.signedAt && !spec.internal ? "https://drive.example.com/contracts/signed.pdf" : "",
            terms: spec.terms,
            billing: { cadence: spec.cadence, amountMyr: spec.amount, invoiceDay: spec.invoiceDay ?? 2 },
            renewalStatus: spec.renewalStatus,
            costs: spec.costs ?? [],
            templateName: spec.templateName ?? "",
        });
        const createdAt = iso(spec.signedAt ? Math.min(-1, offsetOf(spec.signedAt)) : -1);
        await patchJson("contracts", c.id, { createdAt, updatedAt: createdAt });
        // The gate the app enforces: a draft has no tasks until the contract is signed.
        const generated = contracts.isSigned(c) && genMonths.length ? await generate.generateContractTasks(c, teamList, [], genMonths) : [];
        for (const w of generated) await patchJson("works", w.id, { createdAt, updatedAt: createdAt });

        // Generated keys read req:<type>:<month>:<row>:<n>.
        const tasks: TaskRef[] = generated
            .map((w) => {
                const [, , gen, ri, nth] = (w.plannerLineId ?? "").split(":");
                return { ri: Number(ri), nth: Number(nth), gen, w };
            })
            .sort((a, b) => a.gen.localeCompare(b.gen) || a.ri - b.ri || a.nth - b.nth);

        // Dress every task: title, channel, holder, approver, fixed day, phase.
        const set = PHASE_SETS[spec.template];
        for (const t of tasks) {
            const row = spec.rows[t.ri];
            const perMonth = row.per === "week" ? row.count * 5 : row.count;
            const idx = Math.max(0, months.indexOf(t.gen)) * perMonth + t.nth - 1;
            const title = row.titles?.length
                ? row.titles[idx % row.titles.length]
                : row.per === "once"
                  ? row.name
                  : row.per === "week"
                    ? `${row.name} · week of ${weekOf(t.w.dueDate)}`
                    : row.count > 1
                      ? `${row.name} ${t.nth}/${row.count} · ${monShort(t.gen)}`
                      : `${row.name} · ${monShort(t.gen)}`;
            const internalContent = spec.internal && (row.type === "static" || row.type === "video");
            t.w = await shapeWork(
                c,
                t.w,
                {
                    title,
                    channel: row.channels?.length ? row.channels[(t.nth - 1) % row.channels.length] : undefined,
                    dueDate: row.dueDay ? nearestWorkingDay(workHelpers.dateForDay(t.gen, row.dueDay)) : undefined,
                    phase: row.phase ?? (row.per === "once" ? undefined : set.work),
                    split: row.who ? [{ seat: DEFAULT_SPLIT[row.type][0].seat, member: row.who, pct: 100 }] : undefined,
                    approver: row.approver ?? (internalContent ? "am" : undefined),
                    milestone: row.per === "once" ? false : undefined,
                },
                teamList,
            );
        }
        return { spec, c, months, tasks };
    }

    /** One task's demo state, addressed by the month it was generated in, its row and its number that month. */
    type Override = { month: string; ri: number; nth: number; state: WorkState; approver?: Approver; dueDate?: string };
    /** Put every task of a project in its state: the overrides where given, the default rule elsewhere. */
    async function applyStates(p: Seeded, overrides: Override[]) {
        for (const o of overrides) {
            if (!p.tasks.some((t) => t.gen === o.month && t.ri === o.ri && t.nth === o.nth)) {
                throw new Error(`No task ${o.month} row ${o.ri} #${o.nth} on ${p.c.name}`);
            }
        }
        for (const t of p.tasks) {
            const o = overrides.find((x) => x.month === t.gen && x.ri === t.ri && x.nth === t.nth);
            if (o?.approver || o?.dueDate) {
                const patch: WorkPatch = {};
                if (o.approver) patch.approver = o.approver;
                if (o.dueDate) {
                    patch.dueDate = o.dueDate;
                    patch.defaultDueDate = o.dueDate;
                }
                t.w = await works.updateWork(t.w.id, patch);
            }
            const s = o ? o.state : defaultState(t.w);
            if (s) t.w = await setWorkState(t.w, s);
        }
    }

    const done: WorkState = { status: "completed" };
    const retainerRanges = { kickoff: [0, 0], foundation: [0, 1], production: [0, -1], review: [-1, -1] } as Record<string, [number, number]>;

    // Dr Kartini — personal brand of a dermatologist consultant, with an animal-rights thread.
    // Six months, ends this month; renewal in talks.
    const kartini = await seedProject({
        name: "Dr Kartini — brand growth",
        clientName: "Dr Kartini",
        am: "Hakim",
        startDate: `${M(-5)}-01`,
        endDate: endOf(M(0)),
        signedAt: SIGNED.kartini,
        reference: "DRK-BRAND-01",
        value: 36000,
        terms: "Six months: 6 statics, 3 Reels/TikToks and 2 SEO articles a month on skin health and animal welfare, weekly community management, a monthly report and strategy call.",
        cadence: "monthly",
        amount: 6000,
        templateName: "Growth",
        renewalStatus: "in_talks",
        template: "Social retainer",
        ranges: retainerRanges,
        rows: [
            { type: "static", name: "Instagram static", count: 6, per: "month", channel: "Instagram", titles: T.kartiniStatic, who: "Hakim" }, // 0
            { type: "video", name: "Reel / TikTok", count: 3, per: "month", channel: "Instagram", titles: T.kartiniVideo, channels: ["Instagram", "TikTok"] }, // 1
            { type: "seo", name: "Blog article", count: 2, per: "month", channel: "Blog", titles: T.kartiniSeo }, // 2
            { type: "custom", name: "Community management", count: 1, per: "week", channel: "Instagram", approver: "none" }, // 3
            { type: "custom", name: "Monthly content report", count: 1, per: "month", channel: "Report" }, // 4
            { type: "custom", name: "Content calendar & captions", count: 1, per: "month", channel: "Planning", dueDay: 26 }, // 5
            { type: "custom", name: "Monthly strategy call", count: 1, per: "month", channel: "Call", who: "Naim", approver: "none", dueDay: 3 }, // 6
        ],
        crew: { dm: "Danisy", creative: "Izzad", am: "Hakim" },
    });
    await applyStates(kartini, [
        { month: M(0), ri: 1, nth: 2, state: { status: "pending_approval", submittedDaysAgo: 3 } }, // client approval, 3 days
        { month: M(0), ri: 2, nth: 1, state: { status: "in_progress", startedDaysAgo: 8, waiting: "client", waitingDays: 6 } }, // waiting for her medical review (now late)
        { month: M(0), ri: 0, nth: 3, state: { status: "in_progress", startedDaysAgo: 3, waiting: "client", waitingDays: 2 } }, // waiting for clinic photos
    ]);

    // Rouang — interior design contractor: portfolio content plus a lead-gen campaign. Ends next month, renewal at risk.
    const rouang = await seedProject({
        name: "Rouang — portfolio content & leads",
        clientName: "Rouang",
        am: "Izzad",
        startDate: `${M(-4)}-01`,
        endDate: endOf(M(1)),
        signedAt: SIGNED.rouang,
        reference: "RG-SOC-01",
        value: 27000,
        terms: "Six months: 6 project statics and 3 site videos a month, one Meta lead-gen campaign for free site consultations, a monthly report and growth review.",
        cadence: "monthly",
        amount: 4500,
        renewalStatus: "at_risk",
        template: "Social retainer",
        ranges: retainerRanges,
        rows: [
            { type: "static", name: "Project showcase", count: 6, per: "month", channel: "Instagram", titles: T.rouangStatic }, // 0
            { type: "video", name: "Site video", count: 3, per: "month", channel: "Instagram", titles: T.rouangVideo, channels: ["Instagram", "TikTok"] }, // 1
            { type: "campaign", name: "Meta lead-gen: free site consultation", count: 1, per: "month", channel: "Meta" }, // 2
            { type: "custom", name: "Monthly report", count: 1, per: "month", channel: "Report" }, // 3
            { type: "custom", name: "Monthly growth review", count: 1, per: "month", channel: "Call", who: "Yusuf", approver: "none", dueDay: 4 }, // 4
        ],
        crew: { dm: "Danisy", creative: "Izzad", am: "Izzad" },
    });
    await applyStates(rouang, [
        { month: M(-1), ri: 0, nth: 2, state: { status: "completed", lateDays: 3 } },
        { month: M(0), ri: 0, nth: 1, state: { status: "completed", lateDays: 6 } }, // done late
        { month: M(0), ri: 0, nth: 2, state: { status: "not_started" } }, // overdue
        { month: M(0), ri: 1, nth: 1, state: { status: "in_progress", startedDaysAgo: 9, changes: "Use the new Mont Kiara footage and add the logo end card.", revisions: 2 } }, // rework
    ]);

    // Baitul Irfan — NGO raising donations for a surau: donation campaigns, appeal posters, progress videos.
    const baitul = await seedProject({
        name: "Baitul Irfan — surau donation drive",
        clientName: "Baitul Irfan",
        am: "Bob",
        startDate: `${M(-3)}-01`,
        endDate: endOf(M(2)),
        signedAt: SIGNED.baitul,
        reference: "BI-DON-01",
        value: 15000,
        terms: "Six months at our NGO rate: two donation campaigns a month on Meta, 6 appeal posters and 2 progress videos a month, a donor update report.",
        cadence: "monthly",
        amount: 2500,
        template: "Donation drive",
        ranges: { kickoff: [0, 0], appeal: [0, 0], drives: [0, -1], review: [-1, -1] },
        rows: [
            { type: "campaign", name: "Donation campaign", count: 2, per: "month", channel: "Meta", titles: T.baitulCampaign }, // 0
            { type: "static", name: "Appeal poster", count: 6, per: "month", channel: "Facebook", titles: T.baitulStatic, channels: ["Facebook", "Instagram"] }, // 1
            { type: "video", name: "Progress video", count: 2, per: "month", channel: "Facebook", titles: T.baitulVideo }, // 2
            { type: "custom", name: "Donor update report", count: 1, per: "month", channel: "Report" }, // 3
            { type: "custom", name: "Monthly strategy call", count: 1, per: "month", channel: "Call", who: "Naim", approver: "none", dueDay: 3 }, // 4
        ],
        crew: { dm: "Bob", creative: "Bob", am: "Bob" },
    });
    await applyStates(baitul, [
        { month: M(0), ri: 1, nth: 3, state: { status: "pending_approval", submittedDaysAgo: 9 } }, // sent early; the committee has sat on it 9 days
        { month: M(0), ri: 0, nth: 1, state: { status: "not_started" } }, // overdue: the donation link is not ready
    ]);

    // LeanX Digital — our own brand: internal, approved by management, no value, no invoices.
    // It still takes real hours, so it shows in delivery and capacity.
    const digital = await seedProject({
        name: "LeanX Digital — our own brand",
        clientName: "LeanX Digital",
        am: "Yusuf",
        startDate: `${M(-4)}-01`,
        endDate: "",
        signedAt: SIGNED.digital,
        reference: "",
        value: 0,
        terms: "Our own brand: founder videos and LinkedIn posts from Naim, two blog articles, a case study and a newsletter a month, and a monthly website update.",
        cadence: "monthly",
        amount: 0,
        internal: true,
        template: "Social retainer",
        ranges: { production: [0, -1] },
        rows: [
            { type: "video", name: "Founder video", count: 4, per: "month", channel: "LinkedIn", titles: T.digitalVideo, channels: ["LinkedIn", "Instagram"] }, // 0
            { type: "static", name: "LinkedIn post", count: 4, per: "month", channel: "LinkedIn", titles: T.digitalStatic }, // 1
            { type: "seo", name: "Agency blog article", count: 2, per: "month", channel: "Blog", titles: T.digitalSeo }, // 2
            { type: "custom", name: "Case study write-up", count: 1, per: "month", channel: "Website" }, // 3
            { type: "custom", name: "Agency newsletter", count: 1, per: "month", channel: "E-mail", dueDay: 24 }, // 4
            { type: "website", name: "Website update", count: 1, per: "month", channel: "Website" }, // 5
        ],
        crew: { dm: "Yusuf", creative: "Naim", dev: "Zafran", am: "Yusuf" },
    });
    await applyStates(digital, [
        { month: M(-1), ri: 2, nth: 1, state: { status: "in_progress", startedDaysAgo: 26, dueDaysAgo: 20 } }, // our own article, ~20 days overdue
        { month: M(0), ri: 0, nth: 1, state: { status: "completed", lateDays: 2 } },
        { month: M(0), ri: 1, nth: 2, state: { status: "pending_approval", submittedDaysAgo: 1 } }, // AM approval (Yusuf)
    ]);

    // Payright — brand growth for a payments company; software subscription on the costs.
    const payrightCosts = projectMonths({ startDate: `${M(-8)}-01`, endDate: endOf(M(0)) }).map((m) =>
        cost(`Canva Teams + scheduling tool — ${monShort(m)}`, "software", 220, dayOf(m, 3), "Bob"),
    );
    const payright = await seedProject({
        name: "Payright — brand growth",
        clientName: "Payright",
        am: "Bob",
        startDate: `${M(-8)}-01`,
        endDate: endOf(M(3)),
        signedAt: SIGNED.payright,
        reference: "PR-GROW-01",
        value: 90000,
        terms: "Twelve months: 8 statics, 2 merchant videos and 2 SEO articles a month, one Meta merchant lead-gen campaign, a landing page update, a monthly report and growth review.",
        cadence: "monthly",
        amount: 7500,
        templateName: "Scale",
        template: "Social retainer",
        ranges: retainerRanges,
        rows: [
            { type: "static", name: "Instagram static", count: 8, per: "month", channel: "Instagram", titles: T.payrightStatic }, // 0
            { type: "video", name: "Merchant video", count: 2, per: "month", channel: "Instagram", titles: T.payrightVideo, channels: ["Instagram", "TikTok"], who: "Izzad" }, // 1
            { type: "seo", name: "Blog article", count: 2, per: "month", channel: "Blog", titles: T.payrightSeo, who: "Danisy" }, // 2
            { type: "campaign", name: "Meta lead-gen: merchant sign-ups", count: 1, per: "month", channel: "Meta", who: "Danisy" }, // 3
            { type: "custom", name: "Monthly growth review", count: 1, per: "month", channel: "Call", who: "Yusuf", approver: "none", dueDay: 4 }, // 4
            { type: "custom", name: "Monthly performance report", count: 1, per: "month", channel: "Report", who: "Yusuf" }, // 5
            { type: "website", name: "Landing page update", count: 1, per: "month", channel: "Website" }, // 6
        ],
        crew: { dm: "Bob", creative: "Bob", dev: "Zafran", am: "Bob" },
        costs: payrightCosts,
    });
    await applyStates(payright, [
        { month: M(0), ri: 0, nth: 2, state: { status: "completed", lateDays: 4 } }, // done late
    ]);

    // LeanX — brand growth for a payment platform, twelve months from January; renewing.
    const leanx = await seedProject({
        name: "LeanX — brand growth",
        clientName: "LeanX",
        am: "Bob",
        startDate: `${M(-10)}-01`,
        endDate: endOf(M(1)),
        signedAt: SIGNED.leanx,
        reference: "LX-GROW-01",
        value: 96000,
        terms: "Twelve months: 8 statics, 3 videos and 2 SEO articles a month, one Meta campaign, a website update, a monthly report and strategy call.",
        cadence: "monthly",
        amount: 8000,
        templateName: "Scale",
        renewalStatus: "renewing",
        template: "Social retainer",
        ranges: retainerRanges,
        rows: [
            { type: "static", name: "Instagram static", count: 8, per: "month", channel: "Instagram", titles: T.leanxStatic }, // 0
            { type: "video", name: "Reel / TikTok", count: 3, per: "month", channel: "Instagram", titles: T.leanxVideo, channels: ["Instagram", "TikTok"] }, // 1
            { type: "seo", name: "Blog article", count: 2, per: "month", channel: "Blog", titles: T.leanxSeo }, // 2
            { type: "campaign", name: "Meta campaign: merchant acquisition", count: 1, per: "month", channel: "Meta", who: "Danisy" }, // 3
            { type: "custom", name: "Monthly strategy call", count: 1, per: "month", channel: "Call", who: "Naim", approver: "none", dueDay: 3 }, // 4
            { type: "custom", name: "Monthly performance report", count: 1, per: "month", channel: "Report", who: "Yusuf" }, // 5
            { type: "website", name: "Website update", count: 1, per: "month", channel: "Website" }, // 6
        ],
        crew: { dm: "Bob", creative: "Bob", dev: "Zafran", am: "Bob" },
    });
    await applyStates(leanx, [
        { month: M(0), ri: 6, nth: 1, state: { status: "not_started", moveDays: 5 } }, // date moved by the AM
    ]);

    // Leanis Solution — brand growth, six months from September.
    const leanis = await seedProject({
        name: "Leanis Solution — brand growth",
        clientName: "Leanis Solution Sdn Bhd",
        am: "Bob",
        startDate: `${M(-2)}-01`,
        endDate: endOf(M(3)),
        signedAt: SIGNED.leanis,
        quoteKey: "leanis",
        value: 24000,
        terms: "Six months: 6 statics, 2 videos and an SEO article a month for LinkedIn and Instagram, a monthly report and strategy call.",
        cadence: "monthly",
        amount: 4000,
        templateName: "Starter",
        template: "Social retainer",
        ranges: retainerRanges,
        rows: [
            { type: "static", name: "LinkedIn / Instagram static", count: 6, per: "month", channel: "LinkedIn", titles: T.leanisStatic, channels: ["LinkedIn", "Instagram"] }, // 0
            { type: "video", name: "Brand video", count: 2, per: "month", channel: "LinkedIn", titles: T.leanisVideo }, // 1
            { type: "seo", name: "Blog article", count: 1, per: "month", channel: "Blog", titles: T.leanisSeo }, // 2
            { type: "custom", name: "Monthly strategy call", count: 1, per: "month", channel: "Call", who: "Yusuf", approver: "none", dueDay: 4 }, // 3
            { type: "custom", name: "Monthly performance report", count: 1, per: "month", channel: "Report", who: "Yusuf" }, // 4
        ],
        crew: { dm: "Bob", creative: "Bob", am: "Bob" },
    });
    await applyStates(leanis, [
        { month: M(0), ri: 0, nth: 3, state: { status: "pending_approval", submittedDaysAgo: 1 } }, // client approval, fresh
    ]);

    // Zakat Selangor — zakat awareness for Gen Z: video-heavy (a TikTok every week plus Reels),
    // a TikTok awareness campaign; a freelance videographer on the costs.
    const zakatCosts = projectMonths({ startDate: `${M(-5)}-01`, endDate: endOf(M(0)) }).map((m) =>
        cost(`Freelance videographer — ${monShort(m)} shoot days`, "freelancer", 1800, dayOf(m, 6), "Hakim"),
    );
    const zakat = await seedProject({
        name: "Zakat Selangor — Gen Z awareness",
        clientName: "Zakat Selangor",
        am: "Hakim",
        startDate: `${M(-5)}-01`,
        endDate: endOf(M(6)),
        signedAt: SIGNED.zakat,
        reference: "LZS-GENZ-01",
        value: 120000,
        terms: "Twelve months: a TikTok every week and 2 Reels a month, 4 infographics, a TikTok awareness campaign and a landing page update a month, weekly community management, a monthly board report. Shoot days by a freelance videographer.",
        cadence: "monthly",
        amount: 10000,
        template: "Social retainer",
        ranges: retainerRanges,
        rows: [
            { type: "video", name: "TikTok video", count: 1, per: "week", channel: "TikTok", titles: T.zakatTiktok }, // 0
            { type: "video", name: "Instagram Reel", count: 2, per: "month", channel: "Instagram", titles: T.zakatReel }, // 1
            { type: "static", name: "Infographic", count: 4, per: "month", channel: "Instagram", titles: T.zakatStatic, who: "Izzad" }, // 2
            { type: "campaign", name: "TikTok awareness campaign · Gen Z", count: 1, per: "month", channel: "TikTok" }, // 3
            { type: "custom", name: "Community management", count: 1, per: "week", channel: "TikTok", approver: "none" }, // 4
            { type: "custom", name: "Monthly report to the board", count: 1, per: "month", channel: "Report" }, // 5
            { type: "custom", name: "Monthly strategy call", count: 1, per: "month", channel: "Call", who: "Naim", approver: "none", dueDay: 3 }, // 6
            { type: "website", name: "Campaign landing page update", count: 1, per: "month", channel: "Website" }, // 7
            { type: "custom", name: "Content calendar & captions", count: 1, per: "month", channel: "Planning", dueDay: 26 }, // 8
        ],
        crew: { dm: "Danisy", creative: "Bob", dev: "Zafran", am: "Hakim" },
        costs: zakatCosts,
    });
    await applyStates(zakat, [
        { month: M(0), ri: 0, nth: 3, state: { status: "in_progress", startedDaysAgo: 2, waiting: "internal", waitingDays: 1 } }, // waiting on us: the freelancer's footage
        { month: M(0), ri: 2, nth: 2, approver: "am", state: { status: "pending_approval", submittedDaysAgo: 2 } }, // AM approval (Hakim)
    ]);

    // Kembara — a one-off donation website: design done, build under way, launch next month, half billed.
    const kembara = await seedProject({
        name: "Kembara — donation website",
        clientName: "Kembara",
        am: "Zafran",
        startDate: `${M(-1)}-01`,
        endDate: endOf(M(1)),
        signedAt: SIGNED.kembara,
        quoteKey: "kembara",
        value: 18000,
        terms: "Donation website: discovery, design, build with a payment gateway and donor receipts, QA and launch. 50 % on signing, the balance on launch. Illustrations by a freelancer.",
        cadence: "one_off",
        amount: 18000,
        renewalStatus: "not_renewing",
        template: "Website build",
        ranges: { discovery: [0, 0], design: [0, 1], build: [1, 1], "qa-launch": [2, 2] },
        rows: [{ type: "website", name: "Website build", count: 7, per: "once", channel: "Website" }], // 0
        crew: { dev: "Zafran", creative: "Izzad", am: "Zafran" },
        costs: [cost("Freelance illustrator — donation campaign artwork", "freelancer", 2400, dayOf(M(-1), 20), "Zafran")],
    });
    {
        const k = kembara.tasks.map((t) => t.w);
        if (k.length !== 7) throw new Error(`Kembara: expected 7 website tasks, got ${k.length}`);
        const dev100: HandShare[] = [{ seat: "dev", member: "Zafran", pct: 100 }];
        await shapeWork(kembara.c, k[0], { title: "Discovery & sitemap", month: M(-1), dueDay: 8, phase: "discovery", split: dev100, approver: "am", state: done }, teamList);
        await shapeWork(kembara.c, k[1], { title: "Wireframes & visual design", month: M(-1), dueDay: 27, phase: "design", split: [{ seat: "dev", member: "Zafran", pct: 50 }, { seat: "creative", member: "Izzad", pct: 50 }], approver: "client", milestone: true, state: done }, teamList);
        await shapeWork(kembara.c, k[2], { title: "Donation flow & payment gateway", month: M(0), dueDay: 19, phase: "build", split: dev100, approver: "am", state: { status: "in_progress", startedDaysAgo: 6 } }, teamList);
        await shapeWork(kembara.c, k[3], { title: "Campaign pages & CMS", month: M(0), dueDay: 24, phase: "build", split: dev100, approver: "am" }, teamList);
        await shapeWork(kembara.c, k[4], { title: "Donor receipts & e-mail notifications", month: M(0), dueDay: 26, phase: "build", split: dev100, approver: "am" }, teamList);
        await shapeWork(kembara.c, k[5], { title: "QA & UAT with the Kembara team", month: M(1), dueDay: 10, phase: "qa-launch", split: dev100, approver: "am" }, teamList);
        await shapeWork(kembara.c, k[6], { title: "Launch — site live", month: M(1), dueDay: 14, phase: "qa-launch", split: dev100, approver: "client", milestone: true, state: { status: "not_started", moveDays: 3 } }, teamList);
    }

    // Enfrasys — content creation for an IT services company. Signed this month, started a few days ago.
    const enfrasys = await seedProject({
        name: "Enfrasys — content creation",
        clientName: "Enfrasys",
        am: "Izzad",
        startDate: ENFRASYS_START,
        endDate: endOf(M(5)),
        signedAt: SIGNED.enfrasys,
        quoteKey: "enfrasys",
        value: 33000,
        terms: "Six months of content: 8 LinkedIn statics and 4 explainer videos a month, a monthly content report. Kickoff workshop with their marketing team.",
        cadence: "monthly",
        amount: 5500,
        invoiceDay: Number(ENFRASYS_START.slice(8, 10)),
        template: "Social retainer",
        ranges: retainerRanges,
        rows: [
            { type: "static", name: "LinkedIn static", count: 8, per: "month", channel: "LinkedIn", titles: T.enfrasysStatic }, // 0
            { type: "video", name: "Explainer video", count: 4, per: "month", channel: "LinkedIn", titles: T.enfrasysVideo, channels: ["LinkedIn", "YouTube"] }, // 1
            { type: "custom", name: "Monthly content report", count: 1, per: "month", channel: "Report" }, // 2
            { type: "custom", name: "Kickoff workshop", count: 1, per: "once", channel: "Workshop", who: "Naim", approver: "none", phase: "kickoff" }, // 3
        ],
        crew: { creative: "Izzad", am: "Izzad" },
    });
    await applyStates(enfrasys, [
        { month: M(0), ri: 3, nth: 1, dueDate: later(ENFRASYS_START, ymd(-2)), state: { status: "completed", doneDaysAgo: Math.min(2, ago(ENFRASYS_START)) } },
    ]);

    // Tropicor — campaign management: several Meta and Google campaigns a month plus ad statics.
    // The fee includes a managed ad budget, which lands on the costs as ad spend.
    const tropicorCosts = projectMonths({ startDate: `${M(-1)}-01`, endDate: endOf(M(0)) }).flatMap((m) => {
        const current = m === MONTH;
        return [
            cost(`Meta ad spend — ${monShort(m)}${current ? " (to date)" : ""}`, "ad_spend", current ? 1150 : 2450, current ? TODAY : endOf(m), "Danisy"),
            cost(`Google Ads spend — ${monShort(m)}${current ? " (to date)" : ""}`, "ad_spend", current ? 640 : 1480, current ? TODAY : endOf(m), "Danisy"),
        ];
    });
    const tropicor = await seedProject({
        name: "Tropicor — campaign management",
        clientName: "Tropicor",
        am: "Danisy",
        startDate: `${M(-1)}-01`,
        endDate: endOf(M(4)),
        signedAt: SIGNED.tropicor,
        quoteKey: "tropicor",
        value: 57000,
        terms: "Six months of campaign management: two Meta and two Google Ads campaigns a month, 4 ad creatives, a monthly performance report. Fee includes a managed ad budget of RM 4,000 a month.",
        cadence: "monthly",
        amount: 9500,
        template: "Campaign management",
        ranges: { setup: [0, 0], launch: [0, 1], optimise: [0, -1], review: [-1, -1] },
        rows: [
            { type: "campaign", name: "Meta campaign", count: 2, per: "month", channel: "Meta", titles: T.tropicorMeta }, // 0
            { type: "campaign", name: "Google Ads campaign", count: 2, per: "month", channel: "Google", titles: T.tropicorGoogle }, // 1
            { type: "static", name: "Ad creative", count: 4, per: "month", channel: "Instagram", titles: T.tropicorStatic, who: "Bob" }, // 2
            { type: "custom", name: "Monthly performance report", count: 1, per: "month", channel: "Report" }, // 3
            { type: "custom", name: "Monthly growth review", count: 1, per: "month", channel: "Call", who: "Yusuf", approver: "none", dueDay: 4 }, // 4
        ],
        crew: { dm: "Danisy", creative: "Bob", am: "Danisy" },
        costs: tropicorCosts,
    });
    await applyStates(tropicor, []); // nothing special: the default rule alone

    // ---- Planned days: a few owners pulled this month's open tasks earlier than the deadline ----
    // (what the calendar shows when someone drags a task; the deadline stays where the AM put it).
    // Every fourth open task, so the pulls spread over the month; always onto a working day.
    {
        const fresh = await works.listWorks();
        const open = fresh
            .filter((w) => w.status === "not_started" && w.month === MONTH && w.dueDate > ymd(2))
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
        let planned = 0;
        for (const [i, w] of open.entries()) {
            if (planned >= 6) break;
            if (i % 4 !== 0) continue;
            const earlierDay = nearestWorkingDay(workHelpers.shiftYmd(w.dueDate, planned % 2 === 0 ? -2 : -3));
            if (earlierDay < TODAY || earlierDay >= w.dueDate || earlierDay.slice(0, 7) !== MONTH) continue;
            await patchJson("works", w.id, { plannedDate: earlierDay });
            planned += 1;
        }
    }

    // ---- One open seat: an Enfrasys static this month whose creative share nobody holds yet ----
    // (Izzad is over his hours; the AM took him off it and has not found anyone).
    {
        const fresh = await works.listWorks();
        const w = fresh
            .filter((x) => x.contractId === enfrasys.c.id && x.month === MONTH && x.type === "static" && x.status === "not_started" && x.split.some((s) => s.seat === "creative"))
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
        if (w) await patchJson("works", w.id, { split: w.split.map((s) => (s.seat === "creative" ? { ...s, member: "" } : s)) });
    }

    // ---- Sprint tasks (the team's own to-dos, outside the projects) --------------------
    const SPRINT: Array<{ title: string; pic: string; due: number; doneAt?: number; details?: string }> = [
        { title: "Prepare Leanis November invoice", pic: "Farisha", due: 1, details: "Draft is in Finances; check the retainer line before sending." },
        { title: "Chase Baitul Irfan September and October invoices", pic: "Farisha", due: -2, details: "Treasurer sign-off pending; send a statement of account." },
        { title: "Draft quotation for Sekolah Tahfiz Al-Hikmah", pic: "Farisha", due: 2, details: "Donation website plus Meta ads setup; Naim has the scope." },
        { title: "Enfrasys onboarding pack and countersigned contract", pic: "Farisha", due: -6, doneAt: -7 },
        { title: "Send Kembara deposit receipt", pic: "Farisha", due: -9, doneAt: -9 },
        { title: "Weekly operations review", pic: "Yusuf", due: 0 },
        { title: "Close last month's P&L", pic: "Yusuf", due: -5, doneAt: -3 },
        { title: "Renew Canva and Google Workspace seats", pic: "Yusuf", due: 6 },
        { title: "Dr Kartini monthly performance report", pic: "Hakim", due: -8, doneAt: -9 },
        { title: "Zakat Selangor board update deck", pic: "Hakim", due: 3 },
        { title: "Dr Kartini renewal proposal", pic: "Hakim", due: 4 },
        { title: "Payright Meta pixel and conversions API audit", pic: "Bob", due: 5 },
        { title: "Baitul Irfan donation link tracking", pic: "Bob", due: -10, doneAt: -10 },
        { title: "Export Rouang brand kit for print", pic: "Izzad", due: -4, doneAt: -2 },
        { title: "Enfrasys LinkedIn banner set", pic: "Izzad", due: -1 },
        { title: "Kembara staging server and SSL", pic: "Zafran", due: -12, doneAt: -12 },
        { title: "Tropicor Google Ads conversion tracking", pic: "Danisy", due: 2 },
        { title: "Rouang renewal call", pic: "Naim", due: 3, details: "Bring the lead-quality numbers and two options." },
        { title: "Set up Tropicor Looker Studio dashboard", pic: "", due: 7 },
    ];
    for (const t of SPRINT) {
        const row = await sprint.createSprintTask({
            title: t.title,
            pic: t.pic,
            deadline: ymd(t.due),
            details: t.details ?? "",
        });
        if (t.doneAt !== undefined) {
            await sprint.updateSprintTask(row.id, { status: "done", completedAt: iso(t.doneAt) });
        }
    }

    // ---- Campaigns outside the projects' deliverables -------------------------------
    // (The projects' campaigns were created with their tasks and follow the task's state.)
    await campaigns.createCampaign({
        name: "Tropicor — always-on brand search",
        clientName: "Tropicor",
        contractId: tropicor.c.id,
        platform: "google",
        objective: "sales",
        startDate: ymd(14),
        endDate: "",
        monthlyBudgetMyr: 1500,
        feeModel: "percent",
        percentFee: 15,
    });
    // Budget and fee model on the projects' live campaigns, so the ads pages have numbers.
    for (const c of await campaigns.listCampaigns()) {
        if (c.status !== "live" || c.monthlyBudgetMyr) continue;
        await campaigns.updateCampaign(c.id, {
            objective: c.clientName === "Baitul Irfan" ? "awareness" : "leads",
            monthlyBudgetMyr: c.clientName === "Tropicor" ? 2000 : c.clientName === "Baitul Irfan" ? 500 : 1200,
            feeModel: "flat_plus_percent",
            flatFeeMyr: 800,
            percentFee: 10,
        });
    }

    // ---- History: a paused retainer and a churned one-off (no tasks left to deliver) ----
    const sutera = await seedProject({
        name: "Sutera Batik — social retainer",
        clientName: "Sutera Batik Studio",
        am: "Bob",
        startDate: `${M(-10)}-01`,
        endDate: endOf(M(-6)),
        signedAt: SIGNED.sutera,
        reference: "SB-SOC-01",
        value: 12500,
        terms: "Five months of social media for the Raya collection. Paused by the client.",
        cadence: "monthly",
        amount: 2500,
        status: "completed",
        stage: "completed",
        template: "Social retainer",
        ranges: retainerRanges,
        rows: [],
        crew: { dm: "Bob", creative: "Izzad", am: "Bob" },
    });
    const paklong = await seedProject({
        name: "Pak Long Kopitiam — website & menu revamp",
        clientName: "Pak Long Kopitiam",
        am: "Zafran",
        startDate: `${M(-6)}-01`,
        endDate: endOf(M(-4)),
        signedAt: SIGNED.paklong,
        reference: "PLK-WEB-01",
        value: 9500,
        terms: "Website with an online menu and a printed menu revamp: 50 % on signing, 50 % on handover.",
        cadence: "one_off",
        amount: 9500,
        status: "completed",
        stage: "completed",
        template: "Website build",
        ranges: { discovery: [0, 0], design: [0, 1], build: [1, -1], "qa-launch": [-1, -1] },
        rows: [],
        crew: { dev: "Zafran", creative: "Izzad", am: "Zafran" },
    });

    // ---- Invoices: monthly from the retainers' billing, the one-offs in parts ------------
    let raised = 0;
    raised += await settleMonthInvoices(kartini.c, kartini.months, "sent");
    raised += await settleMonthInvoices(rouang.c, rouang.months, "sent");
    // An NGO paying slowly: September and October still out (one 40+ days late, one 10–30).
    raised += await settleMonthInvoices(baitul.c, baitul.months, "sent", { [M(-2)]: { status: "sent" }, [M(-1)]: { status: "sent" } });
    // Payright paid this month's invoice within the week: a receipt this month.
    raised += await settleMonthInvoices(payright.c, payright.months, "paid", { [MONTH]: { status: "paid", paidAfterDays: 5 } });
    raised += await settleMonthInvoices(leanx.c, leanx.months, "sent");
    // Leanis: this month's invoice is still a draft Farisha is preparing.
    raised += await settleMonthInvoices(leanis.c, leanis.months, "draft");
    // Zakat Selangor paid last month's invoice late, this month: another receipt.
    raised += await settleMonthInvoices(zakat.c, zakat.months, "sent", { [M(-1)]: { status: "paid", paidAfterDays: Math.max(14, ago(dayOf(M(-1), 2)) - 8) } });
    raised += await settleMonthInvoices(enfrasys.c, enfrasys.months, "sent");
    raised += await settleMonthInvoices(tropicor.c, tropicor.months, "sent");
    raised += await settleMonthInvoices(sutera.c, sutera.months, "paid");
    // LeanX Digital is internal: no invoices.

    // Kembara — 50 % on signing (paid); the balance is invoiced on launch next month.
    await seedInvoice({
        clientName: "Kembara",
        contractId: kembara.c.id,
        issueDate: SIGNED.kembara,
        dueDate: workHelpers.shiftYmd(SIGNED.kembara, 14),
        items: [item("Donation website — 50 % on signing", 9000)],
        status: "paid",
        paidAfterDays: 6,
    });
    // Pak Long Kopitiam (churned) — deposit paid; the handover balance is 60+ days overdue.
    await seedInvoice({
        clientName: "Pak Long Kopitiam",
        contractId: paklong.c.id,
        issueDate: SIGNED.paklong,
        dueDate: workHelpers.shiftYmd(SIGNED.paklong, 14),
        items: [item("Website & menu revamp — 50 % on signing", 4750)],
        status: "paid",
        paidAfterDays: 9,
    });
    await seedInvoice({
        clientName: "Pak Long Kopitiam",
        contractId: paklong.c.id,
        issueDate: ymd(-80),
        dueDate: ymd(-66),
        items: [item("Website & menu revamp — 50 % on handover", 4750)],
        status: "sent", // 66 days late
    });

    // ---- Summary ----------------------------------------------------------------------
    const [contractRows, workRows, postRows, campaignRows, articleRows, invoiceRows, clientRows, sprintRows] = await Promise.all([
        contracts.listContracts(),
        works.listWorks(),
        content.listContentPosts(),
        campaigns.listCampaigns(),
        seo.listSeoArticles(),
        invoices.listInvoices(),
        clients.listClients(),
        sprint.listSprintTasks(),
    ]);
    const countBy = <T,>(rows: T[], key: (r: T) => string) => {
        const out: Record<string, number> = {};
        for (const r of rows) out[key(r)] = (out[key(r)] ?? 0) + 1;
        return Object.entries(out)
            .map(([k, n]) => `${n} ${k}`)
            .join(", ");
    };
    const perContract = contractRows
        .map((c) => {
            const list = workRows.filter((w) => w.contractId === c.id);
            return `    ${c.code} ${c.name} [${c.stage}${c.signedAt ? "" : ", UNSIGNED"}] AM ${c.accountManager}: ${list.length} tasks (${countBy(list, (w) => w.status) || "none"}) ← ${requirementsLabel(c) || "no deliverables"}`;
        })
        .join("\n");
    const unsigned = contractRows.filter((c) => !c.signedAt).length;
    const closed = contractRows.filter((c) => c.stage === "completed").length;
    const overdueInvoices = invoiceRows.filter((i) => i.status === "sent" && i.dueDate < TODAY).length;

    console.log(
        [
            "Demo data seeded into .dev-data/:",
            `  ${TEAM.length} team members, ${clientRows.length} clients (${countBy(clientRows, (c) => c.status)}), ${LEADS.length} leads, ${QUOTES.length} quotations, ${SERVICES.length} services`,
            `  ${contractRows.length} projects (tasks generated from their deliverables for ${GEN_FROM} to ${GEN_TO}; ${unsigned} unsigned, ${closed} closed)`,
            `  ${workRows.length} tasks (${countBy(workRows, (w) => w.status)}) — ${workRows.filter((w) => w.dueDate !== w.defaultDueDate).length} with a date moved by the AM, ${workRows.filter((w) => w.status !== "completed" && w.dueDate && w.dueDate < TODAY).length} overdue`,
            perContract,
            `  ${postRows.length} content posts, ${campaignRows.length} campaigns, ${articleRows.length} SEO articles (from the projects), ${invoiceRows.length} invoices (${countBy(invoiceRows, (i) => i.status)}; ${raised} raised monthly from the retainers' billing; ${overdueInvoices} overdue)`,
            `  ${sprintRows.length} sprint tasks (${sprintRows.filter((t) => t.status === "done").length} done)`,
            "",
            "Open http://localhost:3001/dashboard to see the Dashboard tabs.",
        ].join("\n"),
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
