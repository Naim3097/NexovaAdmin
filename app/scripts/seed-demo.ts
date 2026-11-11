/**
 * Demo seed for the LOCAL dev-store (.dev-data/) — never touches Supabase.
 *
 * Fills the sandbox with a believable agency snapshot (team, clients, leads,
 * quotations, contracts with their tasks and the posts / campaigns / SEO
 * articles they are done in, invoices across several months) so the
 * Management tabs have real shapes to show: an overloaded designer, an idle
 * SEO specialist, a client waiting on review, stale leads, an expiring quote,
 * a retainer month whose invoice was never sent, overdue invoices, overdue
 * tasks, a task whose date the account manager moved, an unsigned contract
 * with tasks waiting.
 *
 * Delivery is requirement-based: the account manager creates the contract
 * with its REQUIREMENTS ("8 posts a month, 1 campaign a month, 2 branding
 * items once"), a CREW (one person per seat) and the phases of a template,
 * and the tasks are generated from them (src/lib/contracts/generate.ts) with
 * their linked post / campaign / article. The seed drives that same path,
 * then renames the generic generated titles ("Content post 3 of 8") to the
 * realistic ones below and puts the tasks in their demo states. Invoices are
 * raised month by month from the contract's billing.
 *
 * Usage (from app/):
 *   npm run seed:demo             # refuses if demo-owned data already exists
 *   npm run seed:demo -- --reset  # wipes the seeded entity folders first
 *
 * Only the entities it seeds are wiped on --reset (team, clients, leads,
 * quotations, sprint-tasks, content, invoices, campaigns, services,
 * contracts, works, seo-articles, phase-templates — plus the retired planners
 * folder, if an older seed left one). Onboarding, notifications, audit and
 * uploads are left alone.
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
import * as seo from "@/lib/dev-store/seo-articles";
import * as phaseTemplates from "@/lib/dev-store/phase-templates";
import type { BillingCadence, Contract, ContractStage, ContractStatus, Crew, Requirement } from "@/lib/dev-store/contracts";
import type { LineType, PlannerPhase } from "@/lib/dev-store/planners";
import type { Work, WorkPatch, WorkShare } from "@/lib/data/works";
type HandShare = Omit<WorkShare, "hours"> & { hours?: number };
import type { ServiceCategory } from "@/lib/dev-store/services";
import type { ReservedKey, SystemRole, TeamFunction, TeamMember, TeamRole } from "@/lib/dev-store/team";
import { withHours } from "@/lib/capacity/helpers";
import type { LeadSource, LeadStatus } from "@/lib/dev-store/leads";
import type { Quotation } from "@/lib/dev-store/quotations";
import type { ContentPlatform, ContentReviewStatus, ContentStatus } from "@/lib/dev-store/content";
import type { CampaignPlatform } from "@/lib/dev-store/campaigns";
import type { InvoiceStatus } from "@/lib/dev-store/invoices";

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

const MS_DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
/** YYYY-MM-DD, `offset` days from today (negative = past). */
const ymd = (offset: number) => new Date(NOW + offset * MS_DAY).toISOString().slice(0, 10);
/** Full ISO timestamp, `offset` days from now. */
const iso = (offset: number) => new Date(NOW + offset * MS_DAY).toISOString();
const TODAY = ymd(0);
const MONTH = TODAY.slice(0, 7);
/** YYYY-MM-DD for day `day` of the month `k` months before the current one. */
function monthDay(k: number, day: number): string {
    const [y, m] = MONTH.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 - k, day)).toISOString().slice(0, 10);
}
const LAST_MONTH = monthDay(1, 1).slice(0, 7);
/** YYYY-MM, `n` months after `ym`. */
function monthPlus(ym: string, n: number): string {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
/** Days from today to a YYYY-MM-DD (negative = past). */
const offsetOf = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${TODAY}T00:00:00Z`)) / MS_DAY);

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
    "phase-templates",
];
/** Folders of retired features: wiped on --reset so stale records do not linger, never seeded. */
const LEGACY_DIRS = ["planners"];

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
// SYSTEM roles are permissions (admin / management / user); FUNCTIONS are the
// hats handed out (account manager, sales, finance), each with hours a week
// reserved from delivery.
const TEAM: Array<{
    name: string;
    role: TeamRole;
    skills: string;
    systemRoles: SystemRole[];
    functions?: TeamFunction[];
    reserved?: Partial<Record<ReservedKey, number>>;
    weeklyHours?: number;
    hours?: Partial<Record<LineType, number>>;
}> = [
    { name: "Naim", role: "CEO", skills: "strategy, client relations", systemRoles: ["admin", "management"], functions: ["account_manager"], reserved: { management: 12, account_manager: 4 }, weeklyHours: 24, hours: { custom: 1.5, campaign: 2 } },
    { name: "Yusuf", role: "PM", skills: "delivery, scrum, QA", systemRoles: ["admin", "management"], functions: ["finance", "account_manager"], reserved: { management: 6, finance: 6 }, weeklyHours: 32, hours: { custom: 1.5, website: 3 } },
    { name: "Aina", role: "Closer", skills: "sales, onboarding", systemRoles: ["user"], functions: ["sales", "account_manager"], reserved: { sales: 15 }, weeklyHours: 32, hours: { custom: 1, post: 0.5, campaign: 1 } },
    { name: "Farid", role: "Frontend", skills: "Next.js, React, Tailwind", systemRoles: ["user"], weeklyHours: 32, hours: { website: 10, branding: 4 } },
    { name: "Hafiz", role: "Backend", skills: "Supabase, APIs, DevOps", systemRoles: ["user"], weeklyHours: 32, hours: { website: 12 } },
    { name: "Mei Ling", role: "UI/UX", skills: "Figma, branding, motion", systemRoles: ["user"], weeklyHours: 32, hours: { post: 2.5, branding: 8, website: 6 } },
    { name: "Syafiq", role: "Content", skills: "copywriting, social, video", systemRoles: ["user"], weeklyHours: 32, hours: { post: 1.5, seo: 3, campaign: 2, custom: 2 } },
    { name: "Priya", role: "Ads", skills: "Meta Ads, Google Ads, analytics", systemRoles: ["user"], weeklyHours: 32, hours: { campaign: 8, post: 1 } },
    { name: "Daniel", role: "SEO", skills: "technical SEO, GMB, content strategy", systemRoles: ["user"], weeklyHours: 32, hours: { seo: 5, post: 1 } },
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
        paidAt: input.status === "paid" ? iso(offsetOf(input.issueDate) + (input.paidAfterDays ?? 7)) : null,
    });
    await patchJson("invoices", inv.id, { createdAt: iso(offsetOf(input.issueDate)) });
    return inv;
}

/**
 * Raise the monthly invoices of a retainer contract from its billing, up to
 * the current month: past months paid, this month as given (sent, or still a
 * draft the AM never sent). Later months are raised when they come. Returns
 * how many it raised.
 */
async function settleMonthInvoices(c: Contract, months: string[], thisMonth: InvoiceStatus): Promise<number> {
    let n = 0;
    for (const month of months) {
        if (month > MONTH) break;
        const inv = await invoicing.raiseMonthInvoice(c, month);
        if (!inv) continue;
        const status: InvoiceStatus = month < MONTH ? "paid" : thisMonth;
        await invoices.updateInvoice(inv.id, {
            status,
            paidAt: status === "paid" ? iso(offsetOf(inv.issueDate) + 7) : null,
        });
        await patchJson("invoices", inv.id, { createdAt: iso(Math.min(offsetOf(inv.issueDate), 0)) });
        n += 1;
    }
    return n;
}

// --- Realistic titles for the generated tasks ------------------------------------
/** Rotating post titles per client, "Reel: …" / "Carousel: …". */
const POST_POOLS: Record<string, string[]> = {
    leanx: [
        "Reel: Founder story",
        "Carousel: Product features",
        "Reel: FPX explainer",
        "Carousel: Payment myths",
        "Reel: Merchant onboarding tips",
        "Carousel: Security & trust",
        "Reel: Customer testimonial",
        "Carousel: Month-end recap",
        "Reel: Behind the scenes",
        "Carousel: Fees explained",
        "Reel: A day with a merchant",
        "Carousel: Case study — café chain",
        "Reel: Product update",
        "Carousel: Cashflow tips for SMEs",
        "Reel: Team spotlight",
        "Carousel: Q&A from the inbox",
    ],
    nusa: [
        "Reel: Class highlights",
        "Carousel: Beginner's guide to HIIT",
        "Reel: Trainer tip of the week",
        "Carousel: Membership perks",
        "Reel: Member transformation",
        "Carousel: Stretching routine",
        "Reel: Studio tour",
        "Carousel: Meal prep basics",
    ],
    harmoni: [
        "Reel: Clinic tour",
        "Carousel: Patient FAQ — braces",
        "Reel: Teeth whitening promo",
        "Carousel: Kids' first visit",
        "Reel: Meet the dentist",
        "Carousel: Invisalign vs braces",
        "Reel: Before & after",
        "Carousel: Oral care myths",
        "Reel: Scaling explained",
        "Carousel: Dental insurance 101",
        "Reel: Patient testimonial",
        "Carousel: Emergency dental care",
    ],
};
const SEO_POOLS: Record<string, string[]> = {
    leanx: [
        "How FPX payments work for Malaysian SMEs",
        "Choosing a payment gateway in 2026",
        "Reducing failed transactions at checkout",
        "E-invoicing: what merchants must know",
        "The cashless café playbook",
        "Subscription billing for small businesses",
        "QR payments vs cards: a merchant's guide",
        "Chargebacks explained",
        "Payment security checklist for SMEs",
        "Merchant onboarding checklist",
        "Cross-border payments 101",
        "Reconciliation made simple",
    ],
};

/** Channel → the platform of the post / campaign record it is done in. */
function contentPlatform(channel: string): ContentPlatform {
    const c = channel.toLowerCase();
    if (c.includes("tiktok")) return "tiktok";
    if (c.includes("facebook")) return "facebook";
    if (c.includes("linkedin")) return "linkedin";
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

/** The phases of a starter template with month ranges filled in (indexes into `months`; negative = from the end). */
function phasesFromTemplate(templateName: string, months: string[], ranges: Record<string, [number, number]>): PlannerPhase[] {
    const t = phaseTemplates.STARTER_PHASE_TEMPLATES.find((x) => x.name === templateName);
    if (!t?.phases) throw new Error(`No starter phase template "${templateName}"`);
    const last = months.length - 1;
    const at = (i: number) => months[Math.max(0, Math.min(last, i < 0 ? last + 1 + i : i))];
    return t.phases.map((ph) => {
        const r = ranges[ph.key];
        return r ? { ...ph, startMonth: at(r[0]), endMonth: at(r[1]) } : { ...ph };
    });
}

// --- Work states ----------------------------------------------------------------
type WorkState =
    | { status: "completed"; doneDaysAgo?: number }
    | { status: "in_progress"; startedDaysAgo?: number; changes?: string; revisions?: number }
    | { status: "pending_approval"; submittedDaysAgo?: number }
    | { status: "not_started"; overdue?: boolean; moveDays?: number };

/**
 * Put a task (and the post / campaign / article it is linked to) in a state.
 * The account manager has sent the request for the task's month.
 */
async function setWorkState(w: Work, s: WorkState) {
    const am = w.accountManager;
    const url = `https://drive.example.com/work/${w.id.slice(0, 8)}`;
    const monthStart = Math.min(offsetOf(`${w.month}-02`), 0);
    let started: number | null = null;
    const patch: WorkPatch = { status: s.status };
    switch (s.status) {
        case "completed": {
            const done = s.doneDaysAgo !== undefined ? -s.doneDaysAgo : Math.min(offsetOf(w.dueDate) - 1, -1);
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
    patch.requestedAt = iso(Math.min(monthStart, started === null ? 0 : started - 1));
    const next = await works.updateWork(w.id, patch);
    await syncLinked(next, s);
}

/** Mirror a task's state onto the record it is done in (post / campaign / article). */
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
            approvedBy: w.status === "completed" ? "Client" : "",
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

/** Tasks of one contract in one month (optionally one type), earliest due first. */
function worksOf(all: Work[], contractId: string, month: string, type?: LineType): Work[] {
    return all
        .filter((w) => w.contractId === contractId && w.month === month && (!type || w.type === type))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
}

// --- Shaping the generated tasks ---------------------------------------------------
/**
 * What the seed changes on a generated task so the demo reads like a real
 * engagement: the title (and the linked record's), the channel, a move to
 * another month for one-off items, the due day, the phase, the people on it.
 */
type Shape = {
    title: string;
    channel?: string;
    /** YYYY-MM to move the task to (one-off items land in the first month by default). */
    month?: string;
    dueDay?: number;
    /** Phase key on the contract. */
    phase?: string;
    split?: HandShare[];
    approver?: Work["approver"];
    milestone?: boolean;
    state?: WorkState;
};

async function shapeWork(c: Contract, w: Work, s: Shape, teamList: TeamMember[]): Promise<Work> {
    const month = s.month ?? w.month;
    const dueDate = s.dueDay ? workHelpers.dateForDay(month, s.dueDay) : s.month ? workHelpers.dateForDay(month, Number(w.dueDate.slice(8, 10))) : w.dueDate;
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
    const next = await works.updateWork(w.id, patch);
    const assignee = workHelpers.primaryMember(next);
    if (next.linked?.kind === "content") {
        await content.updateContentPost(next.linked.id, { title: s.title, platform: contentPlatform(channel), scheduledFor: dueDate, planMonth: month, assignee });
    } else if (next.linked?.kind === "campaign") {
        await campaigns.updateCampaign(next.linked.id, { name: s.title, platform: campaignPlatform(channel), startDate: dueDate });
    } else if (next.linked?.kind === "seo") {
        await seo.updateSeoArticle(next.linked.id, { title: s.title, targetDate: dueDate, assignee });
    }
    if (s.state) await setWorkState(next, s.state);
    return next;
}

/**
 * The generated tasks keyed "<month>:<requirement index>", in the order the
 * generator made them (months × requirements × count), so the seed can tell
 * "the second one-off branding item" from "the monthly custom task" even
 * though both carry generic titles.
 */
function groupGenerated(c: Contract, months: string[], generated: Work[]): Map<string, Work[]> {
    const first = months[0];
    const queue = [...generated];
    const out = new Map<string, Work[]>();
    for (const month of months) {
        c.requirements.forEach((r, ri) => {
            const n = r.cadence === "monthly" ? r.count : month === first ? r.count : 0;
            out.set(`${month}:${ri}`, queue.splice(0, n));
        });
    }
    if (queue.length) throw new Error(`${queue.length} generated tasks on ${c.code} did not match its requirements`);
    return out;
}

/** "8 posts/mo, 2 branding items once" — for the printed summary. */
function requirementsLabel(c: Contract): string {
    const words: Record<LineType, [string, string]> = {
        post: ["post", "posts"],
        campaign: ["campaign", "campaigns"],
        seo: ["SEO article", "SEO articles"],
        website: ["website item", "website items"],
        branding: ["branding item", "branding items"],
        custom: ["custom task", "custom tasks"],
    };
    return c.requirements
        .map((r) => `${r.count} ${words[r.type][r.count === 1 ? 0 : 1]}${r.cadence === "monthly" ? "/mo" : " once"}`)
        .join(", ");
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

    // ---- Phase templates (Social retainer is the default for new contracts) ----
    for (const t of phaseTemplates.STARTER_PHASE_TEMPLATES) {
        await phaseTemplates.createPhaseTemplate(t);
    }

    // ---- Team ---------------------------------------------------------------
    for (const m of TEAM) {
        await team.createTeamMember({
            name: m.name,
            role: m.role,
            email: `${m.name.toLowerCase().replace(/\s+/g, ".")}@nexova.local`,
            skills: m.skills,
            systemRoles: m.systemRoles,
            functions: m.functions ?? [],
            weeklyHours: m.weeklyHours,
            reservedHours: m.reserved ?? {},
            hoursByType: m.hours,
        });
    }
    const teamList = await team.listTeamMembers();

    // ---- Clients ------------------------------------------------------------
    const CLIENTS = [
        { name: "Lean.x Sdn Bhd", status: "active", am: "Aina", pkg: "Growth", quota: 12, retainer: 4500, industry: "Fintech", renews: 18, since: 300 },
        { name: "Kopi Kita Café", status: "active", am: "Aina", pkg: "Starter", quota: 0, retainer: 0, industry: "F&B", renews: 0, since: 45 },
        { name: "Harmoni Dental Clinic", status: "active", am: "Yusuf", pkg: "Growth", quota: 8, retainer: 3200, industry: "Healthcare", renews: 40, since: 200 },
        { name: "Zenith Properties", status: "active", am: "Naim", pkg: "Enterprise", quota: 0, retainer: 0, industry: "Real estate", renews: 0, since: 90 },
        { name: "Nusa Fitness Studio", status: "active", am: "Aina", pkg: "Starter", quota: 8, retainer: 1800, industry: "Fitness", renews: 9, since: 150 },
        { name: "Bayu Logistics", status: "paused", am: "Yusuf", pkg: "", quota: 0, retainer: 0, industry: "Logistics", renews: 0, since: 400 },
        { name: "Sinar Interiors", status: "churned", am: "Naim", pkg: "", quota: 0, retainer: 0, industry: "Interior design", renews: 0, since: 520 },
    ] as const;
    for (const c of CLIENTS) {
        const row = await clients.createClient({
            name: c.name,
            status: c.status,
            accountManager: c.am,
            packageName: c.pkg,
            monthlyContentQuota: c.quota,
            monthlyRetainerMyr: c.retainer,
            contentRevisionLimit: 3,
            industry: c.industry,
            contactName: "Demo contact",
            contactEmail: "contact@example.com",
        });
        if (c.renews) {
            await clients.updateClient(row.id, { packageRenewsOn: ymd(c.renews) });
        }
        await patchJson("clients", row.id, { createdAt: iso(-c.since) });
    }

    // ---- Leads (pipeline) ------------------------------------------------------
    // "proposal" is a plain pipeline stage: the deal is priced on a quotation
    // and waiting on the client. Won deals with a contract link to it from the
    // board; won deals without one offer "Create contract".
    const LEADS: Array<{
        name: string;
        company: string;
        status: LeadStatus;
        value: number;
        owner: string;
        touchedDaysAgo: number;
        score: number;
        source: LeadSource;
        interest: string;
        auto?: boolean;
    }> = [
        // Won and under contract.
        { name: "Amira Hassan", company: "Lean.x Sdn Bhd", status: "won", value: 54000, owner: "Aina", touchedDaysAgo: 40, score: 92, source: "referral", interest: "Social media, Meta ads, SEO" },
        { name: "Nadia Rahim", company: "Nusa Fitness Studio", status: "won", value: 7500, owner: "Aina", touchedDaysAgo: 38, score: 80, source: "instagram", interest: "Social media management" },
        // Agreed on a call; the contract exists but the signed copy never came back.
        { name: "Dr. Lina Mokhtar", company: "Harmoni Dental Clinic", status: "proposal", value: 10800, owner: "Yusuf", touchedDaysAgo: 4, score: 84, source: "website", interest: "GMB + local SEO, Meta ads" },
        // Quoted, waiting on the client.
        { name: "Aiman Rashid", company: "Selangor Tutors", status: "proposal", value: 12000, owner: "Aina", touchedDaysAgo: 2, score: 78, source: "referral", interest: "Website, Google Ads" },
        { name: "Grace Tan", company: "Tan & Co Legal", status: "proposal", value: 25000, owner: "Naim", touchedDaysAgo: 10, score: 70, source: "linkedin", interest: "Website, SEO retainer" },
        { name: "Farah Aziz", company: "Bloom Florist", status: "qualified", value: 6000, owner: "Aina", touchedDaysAgo: 3, score: 62, source: "instagram", interest: "Social media management" },
        { name: "Raj Kumar", company: "Kumar Hardware", status: "qualified", value: 18000, owner: "Aina", touchedDaysAgo: 12, score: 55, source: "website", interest: "App development" },
        { name: "Lim Wei", company: "WeiFit Gym", status: "contacted", value: 4500, owner: "Aina", touchedDaysAgo: 1, score: 48, source: "facebook", interest: "META Ads" },
        { name: "Nurul Huda", company: "Huda Bakery", status: "new", value: 3000, owner: "", touchedDaysAgo: 0, score: 35, source: "website", interest: "Website" },
        { name: "Siti Rahmah", company: "Rahmah Travel", status: "new", value: 0, owner: "", touchedDaysAgo: 0, score: 20, source: "facebook", interest: "", auto: true },
        // Won, no contract recorded yet.
        { name: "Daniel Wong", company: "Wong Dental", status: "won", value: 9600, owner: "Aina", touchedDaysAgo: 6, score: 85, source: "referral", interest: "GMB + SEO" },
        { name: "Marcus Lee", company: "LeeTech Solutions", status: "won", value: 30000, owner: "Naim", touchedDaysAgo: 40, score: 90, source: "event", interest: "Business Operation System" },
        { name: "Hafizah Omar", company: "HZ Boutique", status: "lost", value: 5000, owner: "Naim", touchedDaysAgo: 20, score: 40, source: "instagram", interest: "Website" },
    ];
    for (const l of LEADS) {
        const row = await leads.createLead({
            name: l.name,
            company: l.company,
            email: `${l.name.split(" ")[0].toLowerCase().replace(/\./g, "")}@example.com`,
            source: l.source,
            interestedIn: l.interest,
            estValueMyr: l.value,
            assignedTo: l.owner,
            score: l.score,
            autoIntake: l.auto ?? false,
        });
        await patchJson("leads", row.id, {
            status: l.status,
            createdAt: iso(-(l.touchedDaysAgo + 14)),
            updatedAt: iso(-l.touchedDaysAgo),
        });
    }

    // ---- Quotations (the price behind each contract, plus loose quotes) ----
    const QUOTES: Array<{
        key: string;
        clientName: string;
        subject: string;
        status: "sent" | "accepted" | "converted" | "draft";
        issueDaysAgo: number;
        validDays: number;
        acceptedDaysAgo?: number;
        total: number;
    }> = [
        { key: "leanx-growth", clientName: "Lean.x Sdn Bhd", subject: "Brand growth engagement — 6 months", status: "accepted", issueDaysAgo: 45, validDays: 14, acceptedDaysAgo: 40, total: 54000 },
        { key: "nusa-starter", clientName: "Nusa Fitness Studio", subject: "Social starter — 3 months", status: "accepted", issueDaysAgo: 42, validDays: 14, acceptedDaysAgo: 38, total: 7500 },
        { key: "harmoni-local", clientName: "Harmoni Dental Clinic", subject: "Local growth plan — 3 months", status: "accepted", issueDaysAgo: 10, validDays: 14, acceptedDaysAgo: 4, total: 10800 },
        { key: "tutors", clientName: "Selangor Tutors", subject: "Tuition centre website + Google Ads setup", status: "sent", issueDaysAgo: 12, validDays: 14, total: 12000 },
        { key: "tanco", clientName: "Tan & Co Legal", subject: "Website + 6-month SEO retainer", status: "sent", issueDaysAgo: 5, validDays: 14, total: 25000 },
        { key: "zenith-app", clientName: "Zenith Properties", subject: "Zenith Homes mobile app — build", status: "accepted", issueDaysAgo: 45, validDays: 14, acceptedDaysAgo: 40, total: 45000 },
        { key: "leanx-web", clientName: "Lean.x Sdn Bhd", subject: "Website v2 — design & build", status: "converted", issueDaysAgo: 60, validDays: 14, acceptedDaysAgo: 55, total: 24000 },
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

    // ---- Contracts: requirements + crew + template phases → generated tasks ----------
    type ContractSpec = {
        name: string;
        clientName: string;
        am: string;
        startDate: string;
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
        /** Starter template the phases come from, and their month ranges (indexes into the contract months; negative = from the end). */
        template: string;
        ranges: Record<string, [number, number]>;
        requirements: Requirement[];
        crew: Crew;
        /** Days ago the account manager created the contract. */
        createdDaysAgo: number;
    };
    async function seedContract(spec: ContractSpec): Promise<{ c: Contract; months: string[]; g: Map<string, Work[]> }> {
        const months = generate.contractMonths({ startDate: spec.startDate, endDate: spec.endDate });
        const quote = spec.quoteKey ? quoteByKey[spec.quoteKey] : null;
        const c = await contracts.createContract({
            name: spec.name,
            clientName: spec.clientName,
            accountManager: spec.am,
            startDate: spec.startDate,
            endDate: spec.endDate,
            status: spec.status ?? "active",
            stage: spec.stage ?? (spec.signedAt ? "delivering" : "created"),
            phases: phasesFromTemplate(spec.template, months, spec.ranges),
            requirements: spec.requirements,
            crew: spec.crew,
            reference: spec.reference ?? quote?.number ?? "",
            quotationId: quote?.id ?? null,
            valueMyr: spec.value,
            signedAt: spec.signedAt,
            signedBy: spec.signedAt ? "Client director" : "",
            fileUrl: spec.signedAt ? "https://drive.example.com/contracts/signed.pdf" : "",
            terms: spec.terms,
            billing: { cadence: spec.cadence, amountMyr: spec.amount, invoiceDay: spec.invoiceDay ?? 2 },
        });
        const createdAt = iso(-spec.createdDaysAgo);
        await patchJson("contracts", c.id, { createdAt, updatedAt: createdAt });
        const generated = await generate.generateContractTasks(c, teamList, [], months);
        for (const w of generated) await patchJson("works", w.id, { createdAt, updatedAt: createdAt });
        return { c, months, g: groupGenerated(c, months, generated) };
    }

    /** Monthly production (posts, campaign, SEO) retitled from the pools, under the Production phase. */
    async function shapeProduction(
        c: Contract,
        g: Map<string, Work[]>,
        months: string[],
        spec: { pool: string; postReq: number; campaignReq?: number; seoReq?: number; campaignTitle?: string; campaignOwner?: string },
    ) {
        const postPool = POST_POOLS[spec.pool];
        const seoPool = SEO_POOLS[spec.pool] ?? [];
        for (const [m, month] of months.entries()) {
            const posts = g.get(`${month}:${spec.postReq}`) ?? [];
            for (const [i, w] of posts.entries()) {
                const title = postPool[(m * posts.length + i) % postPool.length];
                await shapeWork(c, w, { title, channel: title.startsWith("Reel") && i % 2 === 1 ? "TikTok" : "Instagram", phase: "production" }, teamList);
            }
            if (spec.campaignReq !== undefined) {
                for (const w of g.get(`${month}:${spec.campaignReq}`) ?? []) {
                    await shapeWork(
                        c,
                        w,
                        {
                            title: `${spec.campaignTitle ?? "Lead-gen campaign"} · ${month}`,
                            phase: "production",
                            split: spec.campaignOwner ? [{ seat: "dm", member: spec.campaignOwner, pct: 100 }] : undefined,
                        },
                        teamList,
                    );
                }
            }
            if (spec.seoReq !== undefined) {
                const articles = g.get(`${month}:${spec.seoReq}`) ?? [];
                for (const [i, w] of articles.entries()) {
                    await shapeWork(c, w, { title: seoPool[(m * articles.length + i) % Math.max(1, seoPool.length)] ?? `SEO article ${i + 1} · ${month}`, phase: "production" }, teamList);
                }
            }
        }
    }

    // Lean.x — the flagship: 6-month brand growth engagement, signed last month, mid-flight.
    const lxMonths = workHelpers.monthRange(LAST_MONTH, monthPlus(LAST_MONTH, 5));
    const lx = await seedContract({
        name: "Lean.x — brand growth engagement",
        clientName: "Lean.x Sdn Bhd",
        am: "Aina",
        startDate: `${LAST_MONTH}-01`,
        endDate: workHelpers.dateForDay(lxMonths[5], 31),
        signedAt: `${LAST_MONTH}-01`,
        quoteKey: "leanx-growth",
        value: 54000,
        terms: "Six months: brand audit and guideline refresh, a landing page, 8 posts, one Meta lead-gen campaign and two SEO articles a month, a monthly strategy call. Ad spend billed at cost.",
        cadence: "monthly",
        amount: 9000,
        template: "Social retainer",
        ranges: { kickoff: [0, 0], foundation: [0, 1], production: [0, 5], review: [5, 5] },
        requirements: [
            { type: "post", count: 8, cadence: "monthly", channel: "Instagram" }, // 0
            { type: "campaign", count: 1, cadence: "monthly", channel: "Meta" }, // 1
            { type: "seo", count: 2, cadence: "monthly", channel: "Blog" }, // 2
            { type: "custom", count: 1, cadence: "monthly", channel: "Call" }, // 3  Monthly strategy call
            { type: "branding", count: 2, cadence: "once", channel: "Brand" }, // 4
            { type: "website", count: 2, cadence: "once", channel: "Website" }, // 5
            { type: "custom", count: 1, cadence: "once", channel: "Workshop" }, // 6
        ],
        crew: { dm: "Syafiq", creative: "Mei Ling", dev: "Farid", seo: "Daniel", am: "Aina" },
        createdDaysAgo: Math.max(1, -offsetOf(`${LAST_MONTH}-01`)),
    });
    await shapeProduction(lx.c, lx.g, lx.months, { pool: "leanx", postReq: 0, campaignReq: 1, seoReq: 2, campaignOwner: "Priya" });
    for (const [m, month] of lx.months.entries()) {
        for (const w of lx.g.get(`${month}:3`) ?? []) {
            await shapeWork(lx.c, w, { title: "Monthly strategy call", dueDay: 3, phase: m === lx.months.length - 1 ? "review" : "production", approver: "none" }, teamList);
        }
    }
    const [lxKickoff, lxGuide] = lx.g.get(`${lx.months[0]}:4`) ?? [];
    await shapeWork(lx.c, lxKickoff, { title: "Kickoff: brand audit & strategy sign-off", channel: "Workshop", phase: "kickoff", dueDay: 5, split: [{ seat: "dm", member: "Syafiq", pct: 50 }, { seat: "creative", member: "Mei Ling", pct: 50 }], approver: "client", milestone: true }, teamList);
    await shapeWork(lx.c, lxGuide, { title: "Brand guideline refresh", phase: "foundation", dueDay: 20, approver: "client", milestone: true }, teamList);
    const [lxLanding, lxLive] = lx.g.get(`${lx.months[0]}:5`) ?? [];
    await shapeWork(lx.c, lxLanding, { title: "Landing page build", month: lx.months[1], phase: "foundation", dueDay: 18, approver: "client", milestone: true }, teamList);
    await shapeWork(lx.c, lxLive, { title: "Website live", month: lx.months[1], phase: "foundation", dueDay: 28, approver: "am", milestone: true }, teamList);
    const [lxWorkshop] = lx.g.get(`${lx.months[0]}:6`) ?? [];
    await shapeWork(lx.c, lxWorkshop, { title: "Brand workshop with leadership team", phase: "kickoff", dueDay: 8, split: [{ seat: "am", member: "Aina", pct: 60 }, { seat: "dm", member: "Syafiq", pct: 40 }], approver: "none" }, teamList);

    // Nusa — a smaller 3-month social retainer, signed last month, this month under way.
    const nusaMonths = workHelpers.monthRange(LAST_MONTH, monthPlus(LAST_MONTH, 2));
    const nusa = await seedContract({
        name: "Nusa Fitness — social starter",
        clientName: "Nusa Fitness Studio",
        am: "Aina",
        startDate: `${LAST_MONTH}-01`,
        endDate: workHelpers.dateForDay(nusaMonths[2], 31),
        signedAt: `${LAST_MONTH}-01`,
        quoteKey: "nusa-starter",
        value: 7500,
        terms: "Three months of reels and carousels (4 a month) after an Instagram profile refresh.",
        cadence: "monthly",
        amount: 2500,
        template: "Social retainer",
        ranges: { kickoff: [0, 0], foundation: [0, 0], production: [0, 2], review: [2, 2] },
        requirements: [
            { type: "post", count: 4, cadence: "monthly", channel: "Instagram" }, // 0
            { type: "branding", count: 1, cadence: "once", channel: "Instagram" }, // 1
        ],
        crew: { dm: "Syafiq", creative: "Mei Ling", am: "Aina" },
        createdDaysAgo: Math.max(1, -offsetOf(`${LAST_MONTH}-01`)),
    });
    await shapeProduction(nusa.c, nusa.g, nusa.months, { pool: "nusa", postReq: 0 });
    const [nusaRefresh] = nusa.g.get(`${nusa.months[0]}:1`) ?? [];
    await shapeWork(nusa.c, nusaRefresh, { title: "Instagram profile refresh", phase: "foundation", dueDay: 8, approver: "client", milestone: true }, teamList);

    // Harmoni — agreed on a call, contract created but NOT signed; tasks waiting, nothing started.
    const hdMonths = workHelpers.monthRange(MONTH, monthPlus(MONTH, 2));
    const hd = await seedContract({
        name: "Harmoni — local growth plan",
        clientName: "Harmoni Dental Clinic",
        am: "Yusuf",
        startDate: `${MONTH}-01`,
        endDate: workHelpers.dateForDay(hdMonths[2], 31),
        signedAt: null, // accepted on a call; the signed copy never came back
        stage: "created",
        quoteKey: "harmoni-local",
        value: 10800,
        terms: "Three months: 6 posts and one Meta campaign a month for whitening and braces consultations.",
        cadence: "monthly",
        amount: 3600,
        invoiceDay: 3,
        template: "Social retainer",
        ranges: { kickoff: [0, 0], foundation: [0, 0], production: [0, 2], review: [2, 2] },
        requirements: [
            { type: "post", count: 6, cadence: "monthly", channel: "Instagram" }, // 0
            { type: "campaign", count: 1, cadence: "monthly", channel: "Meta" }, // 1
        ],
        crew: { dm: "Syafiq", creative: "Mei Ling", am: "Yusuf" },
        createdDaysAgo: 4,
    });
    await shapeProduction(hd.c, hd.g, hd.months, { pool: "harmoni", postReq: 0, campaignReq: 1, campaignOwner: "Priya" });

    // Zenith — a fixed-scope app build on milestones, sprint 3 in flight, launch planned.
    const zenith = await seedContract({
        name: "Zenith Homes app — build",
        clientName: "Zenith Properties",
        am: "Naim",
        startDate: ymd(-45),
        endDate: ymd(75),
        signedAt: ymd(-40),
        quoteKey: "zenith-app",
        value: 45000,
        terms: "Mobile app build in three milestones: discovery + design, build, launch. Brand kit included.",
        cadence: "milestone",
        amount: 15000,
        template: "Website build",
        ranges: { discovery: [0, 0], design: [0, 1], build: [1, -2], "qa-launch": [-1, -1] },
        requirements: [
            { type: "website", count: 5, cadence: "once", channel: "App" }, // 0
            { type: "branding", count: 1, cadence: "once", channel: "Brand" }, // 1
            { type: "custom", count: 1, cadence: "once", channel: "Meeting" }, // 2
        ],
        crew: { dev: "Farid", creative: "Mei Ling", am: "Naim" },
        createdDaysAgo: 45,
    });
    const dev100: HandShare[] = [{ seat: "dev", member: "Farid", pct: 100 }];
    const creative100: HandShare[] = [{ seat: "creative", member: "Mei Ling", pct: 100 }];
    const [zWire, zAuth, zListings, zPush, zLaunch] = zenith.g.get(`${zenith.months[0]}:0`) ?? [];
    await shapeWork(zenith.c, zWire, { title: "Discovery & wireframes", phase: "discovery", dueDay: 24, split: [{ seat: "dev", member: "Farid", pct: 50 }, { seat: "creative", member: "Mei Ling", pct: 50 }], approver: "client", milestone: true, state: { status: "completed" } }, teamList);
    await shapeWork(zenith.c, zAuth, { title: "Auth flow", month: MONTH, phase: "build", dueDay: 6, split: dev100, state: { status: "completed", doneDaysAgo: 3 } }, teamList);
    await shapeWork(zenith.c, zListings, { title: "Listings screen + map integration", month: MONTH, phase: "build", dueDay: 20, split: dev100, state: { status: "in_progress", startedDaysAgo: 5 } }, teamList);
    await shapeWork(zenith.c, zPush, { title: "Push notifications API", month: monthPlus(MONTH, 1), phase: "build", dueDay: 10, split: [{ seat: "dev", member: "Hafiz", pct: 100 }] }, teamList);
    await shapeWork(zenith.c, zLaunch, { title: "App store launch", month: monthPlus(MONTH, 2), phase: "qa-launch", dueDay: 15, split: dev100, approver: "client", milestone: true }, teamList);
    const [zLogo] = zenith.g.get(`${zenith.months[0]}:1`) ?? [];
    await shapeWork(zenith.c, zLogo, { title: "Logo & identity — round 2", month: MONTH, phase: "build", dueDay: 12, split: creative100, approver: "client", state: { status: "pending_approval", submittedDaysAgo: 2 } }, teamList);
    const [zDemo] = zenith.g.get(`${zenith.months[0]}:2`) ?? [];
    await shapeWork(zenith.c, zDemo, { title: "Stakeholder demo — build review", month: monthPlus(MONTH, 1), phase: "build", dueDay: 24, split: [{ seat: "am", member: "Naim", pct: 100 }], approver: "client" }, teamList);

    // Kopi Kita — a one-off brand website, delivered and closed last month.
    const kopi = await seedContract({
        name: "Kopi Kita — brand website",
        clientName: "Kopi Kita Café",
        am: "Aina",
        startDate: ymd(-40),
        endDate: ymd(-7), // ended a week ago
        signedAt: ymd(-41),
        reference: "KK-WEB-01",
        value: 8000,
        terms: "Brand website: wireframes, hi-fi design, build and launch.",
        cadence: "one_off",
        amount: 8000,
        status: "completed",
        stage: "completed",
        template: "Website build",
        ranges: { discovery: [0, 0], design: [0, 0], build: [0, -1], "qa-launch": [-1, -1] },
        requirements: [
            { type: "branding", count: 1, cadence: "once", channel: "Brand" }, // 0
            { type: "website", count: 2, cadence: "once", channel: "Website" }, // 1
        ],
        crew: { dev: "Farid", creative: "Mei Ling", am: "Aina" },
        createdDaysAgo: 40,
    });
    const done: WorkState = { status: "completed" };
    const [kDesign] = kopi.g.get(`${kopi.months[0]}:0`) ?? [];
    await shapeWork(kopi.c, kDesign, { title: "Hi-fi design (Figma)", month: LAST_MONTH, phase: "design", dueDay: 8, split: creative100, approver: "client", state: done }, teamList);
    const [kBuild, kLaunch] = kopi.g.get(`${kopi.months[0]}:1`) ?? [];
    await shapeWork(kopi.c, kBuild, { title: "Site build", month: LAST_MONTH, phase: "build", dueDay: 20, split: dev100, state: done }, teamList);
    await shapeWork(kopi.c, kLaunch, { title: "Launch — site live", month: LAST_MONTH, phase: "qa-launch", dueDay: 26, split: dev100, approver: "client", milestone: true, state: done }, teamList);

    // ---- Task states on the retainers ------------------------------------------------
    const allWorks = await works.listWorks();
    const monthStates = async (contractId: string, month: string, states: Partial<Record<LineType, WorkState[]>>, rest: WorkState | null) => {
        for (const w of worksOf(allWorks, contractId, month)) {
            const queue = states[w.type];
            const s = queue && queue.length ? queue.shift() : rest;
            if (s) await setWorkState(w, s);
        }
    };

    // Lean.x last month: delivered, bar a post the client is still sitting on and an SEO article running late.
    await monthStates(lx.c.id, LAST_MONTH, {
        post: [done, done, done, done, done, done, done, { status: "pending_approval", submittedDaysAgo: 6 }],
        seo: [done, { status: "in_progress", startedDaysAgo: 9 }],
    }, done);
    // Lean.x this month: every state on the board.
    await monthStates(lx.c.id, MONTH, {
        post: [
            { status: "completed", doneDaysAgo: 1 },
            { status: "completed", doneDaysAgo: 1 },
            { status: "not_started", overdue: true },
            { status: "pending_approval", submittedDaysAgo: 1 },
            { status: "pending_approval", submittedDaysAgo: 3 },
            { status: "in_progress", startedDaysAgo: 2 },
            { status: "in_progress", startedDaysAgo: 4, changes: "Use the new logo on every creative.", revisions: 3 },
            { status: "not_started", moveDays: 5 }, // publish moved out by the AM
        ],
        campaign: [{ status: "in_progress", startedDaysAgo: 4 }],
        seo: [{ status: "not_started", overdue: true }, { status: "pending_approval", submittedDaysAgo: 2 }],
        website: [{ status: "in_progress", startedDaysAgo: 10 }, { status: "not_started", moveDays: 7 }], // landing page running; go-live moved by the AM
    }, { status: "not_started" });

    // Nusa last month delivered; this month a mix.
    await monthStates(nusa.c.id, LAST_MONTH, {}, done);
    await monthStates(nusa.c.id, MONTH, {
        post: [
            { status: "completed", doneDaysAgo: 1 },
            { status: "pending_approval", submittedDaysAgo: 2 },
            { status: "in_progress", startedDaysAgo: 1 },
            { status: "not_started" },
        ],
    }, { status: "not_started" });
    // Harmoni: nothing started (contract unsigned) — tasks stay as generated.

    // ---- Sprint tasks ---------------------------------------------------------
    const SPRINT: Array<{ title: string; pic: string; due: number; doneAt?: number; details?: string }> = [
        { title: "Send Lean.x monthly report", pic: "Yusuf", due: 1 },
        { title: "Chase Lean.x overdue invoice", pic: "Aina", due: -2, details: "Website v2 milestone 2 — past due" },
        { title: "Fix 404 on Kopi Kita old menu URL", pic: "Hafiz", due: 3 },
        { title: "Harmoni ad creative brief v2", pic: "Priya", due: 5 },
        { title: "Draft Nusa Fitness next-month content plan", pic: "Syafiq", due: 4 },
        { title: "Export Zenith logo files for print", pic: "Mei Ling", due: -1 },
        { title: "Set up Zenith Google Ads account", pic: "", due: 6 },
        { title: "Weekly standup notes", pic: "Yusuf", due: 0 },
        // Done — a mix of on-time and late for the performance window.
        { title: "Update portfolio page with Kopi Kita", pic: "Farid", due: -4, doneAt: -5 },
        { title: "Renew Harmoni domain", pic: "Hafiz", due: -6, doneAt: -7 },
        { title: "Publish Lean.x last-month report", pic: "Yusuf", due: -9, doneAt: -10 },
        { title: "Harmoni landing page copy", pic: "Syafiq", due: -5, doneAt: -3 },
        { title: "Zenith app auth QA", pic: "Yusuf", due: -3, doneAt: -3 },
        { title: "Kopi Kita DNS cutover", pic: "Hafiz", due: -12, doneAt: -12 },
        { title: "Harmoni creative set B export", pic: "Mei Ling", due: -14, doneAt: -11 },
        { title: "Lean.x product photos retouch", pic: "Mei Ling", due: -8, doneAt: -8 },
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

    // ---- Campaigns outside the contracts' requirements -----------------------------
    // (The contracts' campaigns were created with their tasks and follow the task's state.)
    await campaigns.createCampaign({
        name: "Zenith Homes search",
        clientName: "Zenith Properties",
        contractId: zenith.c.id,
        platform: "google",
        objective: "leads",
        startDate: ymd(14),
        endDate: "",
        monthlyBudgetMyr: 5000,
        feeModel: "percent",
        percentFee: 15,
    });
    // Budget and fee model on the contracts' live campaigns, so the ads pages have numbers.
    for (const c of await campaigns.listCampaigns()) {
        if (c.status !== "live" || c.monthlyBudgetMyr) continue;
        await campaigns.updateCampaign(c.id, {
            objective: "leads",
            monthlyBudgetMyr: c.clientName === "Lean.x Sdn Bhd" ? 3000 : 900,
            feeModel: "flat_plus_percent",
            flatFeeMyr: 800,
            percentFee: 10,
        });
    }

    // ---- Invoices: monthly from the retainers' billing + history + milestones ----
    const LX = "Lean.x Sdn Bhd";
    const HD = "Harmoni Dental Clinic";
    // Lean.x — the previous retainer (before this engagement) paid every month …
    for (let k = 5; k >= 2; k--) {
        await seedInvoice({
            clientName: LX,
            issueDate: monthDay(k, 2),
            dueDate: monthDay(k, 16),
            items: [item(`Previous retainer — ${monthDay(k, 1).slice(0, 7)}`, 4500)],
            status: "paid",
            paidAfterDays: 6 + (k % 3) * 4,
        });
    }
    // … the engagement's month 1 paid, this month's invoice sent; website milestone 2 overdue.
    const lxRaised = await settleMonthInvoices(lx.c, lx.months, "sent");
    await seedInvoice({
        clientName: LX,
        issueDate: ymd(-40),
        dueDate: ymd(-10),
        items: [item("Website v2 — milestone 2 (design sign-off)", 8000)],
        status: "sent", // overdue
    });
    await seedInvoice({
        clientName: LX,
        issueDate: ymd(-75),
        dueDate: ymd(-61),
        items: [item("Website v2 — milestone 1 (deposit)", 8000)],
        status: "paid",
        paidAfterDays: 9,
    });

    // Harmoni — previous retainer paid through last month; the new contract's first invoice stays a draft (unsigned).
    for (let k = 4; k >= 1; k--) {
        await seedInvoice({
            clientName: HD,
            issueDate: monthDay(k, 3),
            dueDate: monthDay(k, 17),
            items: [item(`Previous retainer — ${monthDay(k, 1).slice(0, 7)}`, 3200)],
            status: "paid",
            paidAfterDays: 5 + k * 2,
        });
    }
    const hdRaised = await settleMonthInvoices(hd.c, hd.months, "draft");

    // Nusa — old retainer paid for months -5..-2; on the new contract month 1 is
    // paid, but THIS month's invoice is still a draft nobody sent.
    for (let k = 5; k >= 2; k--) {
        await seedInvoice({
            clientName: "Nusa Fitness Studio",
            issueDate: monthDay(k, 5),
            dueDate: monthDay(k, 19),
            items: [item(`Previous retainer — ${monthDay(k, 1).slice(0, 7)}`, 1800)],
            status: "paid",
            paidAfterDays: 12,
        });
    }
    const nusaRaised = await settleMonthInvoices(nusa.c, nusa.months, "draft");

    // Kopi Kita — one-off, paid.
    await seedInvoice({
        clientName: "Kopi Kita Café",
        contractId: kopi.c.id,
        issueDate: ymd(-30),
        dueDate: ymd(-16),
        items: [item("Menu landing page", 2500)],
        status: "paid",
        paidAfterDays: 12,
    });

    // Zenith — deposit paid, milestone 1 sent (not yet due).
    await seedInvoice({
        clientName: "Zenith Properties",
        contractId: zenith.c.id,
        issueDate: ymd(-42),
        dueDate: ymd(-28),
        items: [item("Mobile app — deposit (30%)", 13500)],
        status: "paid",
        paidAfterDays: 8,
    });
    await seedInvoice({
        clientName: "Zenith Properties",
        contractId: zenith.c.id,
        issueDate: ymd(-5),
        dueDate: ymd(9),
        items: [item("Mobile app — milestone 1 (discovery + design)", 15000)],
        status: "sent",
    });

    // Bayu (paused) and Sinar (churned) — history only.
    await seedInvoice({
        clientName: "Bayu Logistics",
        issueDate: ymd(-120),
        dueDate: ymd(-106),
        items: [item("Fleet portal — scoping & design", 6000)],
        status: "paid",
        paidAfterDays: 20,
    });
    await seedInvoice({
        clientName: "Sinar Interiors",
        issueDate: ymd(-340),
        dueDate: ymd(-326),
        items: [item("Showroom website", 9500)],
        status: "paid",
        paidAfterDays: 10,
    });

    // ---- Summary ----------------------------------------------------------------------
    const [contractRows, workRows, postRows, campaignRows, articleRows, invoiceRows, clientRows] = await Promise.all([
        contracts.listContracts(),
        works.listWorks(),
        content.listContentPosts(),
        campaigns.listCampaigns(),
        seo.listSeoArticles(),
        invoices.listInvoices(),
        clients.listClients(),
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
            return `    ${c.code} ${c.name} [${c.stage}${c.signedAt ? "" : ", UNSIGNED"}]: ${list.length} tasks (${countBy(list, (w) => w.status) || "none"}) ← ${requirementsLabel(c)} · crew ${Object.values(c.crew).join(", ")}`;
        })
        .join("\n");

    console.log(
        [
            "Demo data seeded into .dev-data/:",
            `  ${TEAM.length} team members, ${clientRows.length} clients (${countBy(clientRows, (c) => c.status)}), ${LEADS.length} leads, ${QUOTES.length} quotations, ${SERVICES.length} services`,
            `  ${contractRows.length} contracts (tasks generated from their requirements; 1 unsigned, 1 completed)`,
            `  ${workRows.length} tasks (${countBy(workRows, (w) => w.status)}) — ${workRows.filter((w) => w.dueDate !== w.defaultDueDate).length} with a date moved by the AM, ${workRows.filter((w) => w.status !== "completed" && w.dueDate && w.dueDate < TODAY).length} overdue`,
            perContract,
            `  ${postRows.length} content posts, ${campaignRows.length} campaigns, ${articleRows.length} SEO articles (from the contracts), ${invoiceRows.length} invoices (${countBy(invoiceRows, (i) => i.status)}; ${lxRaised + nusaRaised + hdRaised} raised monthly from the retainers' billing)`,
            "  16 sprint tasks (8 done)",
            "",
            "Open http://localhost:3001/management to see the Management tabs.",
        ].join("\n"),
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
