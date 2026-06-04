/**
 * DEV-ONLY local file store for leads.
 * Replaced by Supabase `leads` table once provisioned.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.join(process.cwd(), ".dev-data");
const LEADS_DIR = path.join(ROOT, "leads");

export const LEAD_STATUSES = [
    "new",
    "contacted",
    "qualified",
    "proposal",
    "won",
    "lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = [
    "referral",
    "website",
    "instagram",
    "facebook",
    "tiktok",
    "google",
    "linkedin",
    "event",
    "cold_outreach",
    "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export type Lead = {
    id: string;
    name: string;
    company: string;
    email: string;
    phone: string;
    source: LeadSource;
    sourceCampaignId: string | null;
    interestedIn: string; // free text or comma-list of services
    estValueMyr: number; // 0 if unknown
    status: LeadStatus;
    notes: string;
    onboardingSubmissionId: string | null;
    /** Team member name owning the lead. Empty = unassigned. */
    assignedTo: string;
    /** Cached score 0–100 (computed from heuristics, see lib/leads/scoring.ts). */
    score: number;
    createdAt: string;
    updatedAt: string;
};

async function ensureDir() {
    await fs.mkdir(LEADS_DIR, { recursive: true });
}

function fileFor(id: string) {
    return path.join(LEADS_DIR, `${id}.json`);
}

export async function createLead(input: {
    name: string;
    company?: string;
    email?: string;
    phone?: string;
    source?: LeadSource;
    sourceCampaignId?: string | null;
    interestedIn?: string;
    estValueMyr?: number;
    notes?: string;
    assignedTo?: string;
    score?: number;
}): Promise<Lead> {
    await ensureDir();
    const now = new Date().toISOString();
    const lead: Lead = {
        id: randomUUID(),
        name: input.name,
        company: input.company ?? "",
        email: input.email ?? "",
        phone: input.phone ?? "",
        source: input.source ?? "other",
        sourceCampaignId: input.sourceCampaignId ?? null,
        interestedIn: input.interestedIn ?? "",
        estValueMyr: input.estValueMyr ?? 0,
        status: "new",
        notes: input.notes ?? "",
        onboardingSubmissionId: null,
        assignedTo: input.assignedTo ?? "",
        score: input.score ?? 0,
        createdAt: now,
        updatedAt: now,
    };
    await fs.writeFile(fileFor(lead.id), JSON.stringify(lead, null, 2), "utf8");
    return lead;
}

export async function listLeads(): Promise<Lead[]> {
    await ensureDir();
    const entries = await fs.readdir(LEADS_DIR);
    const out: Lead[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const raw = await fs.readFile(path.join(LEADS_DIR, entry), "utf8");
        const parsed = JSON.parse(raw) as Lead;
        // Backfill for older records
        if (parsed.sourceCampaignId === undefined) parsed.sourceCampaignId = null;
        if (parsed.assignedTo === undefined) parsed.assignedTo = "";
        if (parsed.score === undefined) parsed.score = 0;
        out.push(parsed);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getLeadById(id: string): Promise<Lead | null> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        const parsed = JSON.parse(raw) as Lead;
        if (parsed.sourceCampaignId === undefined) parsed.sourceCampaignId = null;
        if (parsed.assignedTo === undefined) parsed.assignedTo = "";
        if (parsed.score === undefined) parsed.score = 0;
        return parsed;
    } catch {
        return null;
    }
}

export async function updateLead(
    id: string,
    patch: Partial<Omit<Lead, "id" | "createdAt">>,
): Promise<Lead> {
    const existing = await getLeadById(id);
    if (!existing) throw new Error(`Lead ${id} not found`);
    const updated: Lead = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(fileFor(id), JSON.stringify(updated, null, 2), "utf8");
    return updated;
}

export async function deleteLead(id: string): Promise<void> {
    try {
        await fs.unlink(fileFor(id));
    } catch {
        // ignore
    }
}
