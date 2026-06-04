/**
 * Lead scoring + auto-assign heuristics.
 *
 * Pure functions — given a lead and the team roster, return a score (0–100)
 * and a recommended assignee. Easy to swap for a Claude-powered scorer later
 * (the breakdown shape stays the same).
 *
 * Score is a weighted sum of independent signals. Cap at 100.
 */
import type { Lead, LeadSource } from "@/lib/data/leads";
import type { TeamMember } from "@/lib/data/team";

export type ScoreFactor = {
    label: string;
    points: number;
};

export type ScoreBreakdown = {
    score: number; // 0..100
    factors: ScoreFactor[];
    band: "hot" | "warm" | "cold";
};

const SOURCE_POINTS: Record<LeadSource, number> = {
    referral: 30, // referrals close best
    google: 20,
    linkedin: 18,
    website: 15,
    event: 15,
    instagram: 10,
    facebook: 10,
    tiktok: 8,
    cold_outreach: 5,
    other: 5,
};

function valueBand(myr: number): number {
    if (myr >= 50000) return 35;
    if (myr >= 20000) return 25;
    if (myr >= 10000) return 18;
    if (myr >= 5000) return 12;
    if (myr > 0) return 6;
    return 0; // unknown
}

function contactCompleteness(l: Lead): number {
    let pts = 0;
    if (l.email) pts += 5;
    if (l.phone) pts += 5;
    if (l.company) pts += 5;
    return pts;
}

const HIGH_INTENT_KEYWORDS = [
    "urgent",
    "asap",
    "ready",
    "budget",
    "rfp",
    "proposal",
    "quote",
];
const SERVICE_KEYWORDS = [
    "website",
    "web",
    "ads",
    "google ads",
    "meta",
    "seo",
    "app",
    "branding",
    "redesign",
];

function intentSignal(text: string): number {
    if (!text) return 0;
    const lower = text.toLowerCase();
    let pts = 0;
    if (HIGH_INTENT_KEYWORDS.some((k) => lower.includes(k))) pts += 10;
    if (SERVICE_KEYWORDS.some((k) => lower.includes(k))) pts += 5;
    return pts;
}

export function scoreLead(lead: Lead): ScoreBreakdown {
    const factors: ScoreFactor[] = [];

    const sourcePts = SOURCE_POINTS[lead.source] ?? 5;
    factors.push({
        label: `Source: ${lead.source.replace(/_/g, " ")}`,
        points: sourcePts,
    });

    const valuePts = valueBand(lead.estValueMyr);
    if (valuePts > 0) {
        factors.push({
            label: `Est. value: MYR ${lead.estValueMyr.toLocaleString()}`,
            points: valuePts,
        });
    }

    const contactPts = contactCompleteness(lead);
    if (contactPts > 0) {
        factors.push({
            label: "Contact details on file",
            points: contactPts,
        });
    }

    const intentPts =
        intentSignal(lead.interestedIn) + intentSignal(lead.notes);
    if (intentPts > 0) {
        factors.push({
            label: "High-intent keywords in interest/notes",
            points: intentPts,
        });
    }

    if (lead.sourceCampaignId) {
        factors.push({
            label: "Attributable to a paid campaign",
            points: 5,
        });
    }

    const raw = factors.reduce((s, f) => s + f.points, 0);
    const score = Math.min(100, Math.max(0, raw));
    const band: ScoreBreakdown["band"] =
        score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
    return { score, factors, band };
}

/**
 * Pick the best assignee for a new lead from active team members.
 * Strategy: Closer-role members preferred; tie-break by who currently
 * owns the fewest open leads (round-robin load balancing).
 */
export function pickAssignee(
    team: TeamMember[],
    openLeads: Lead[],
): TeamMember | null {
    const candidates = team.filter((m) => m.active);
    if (candidates.length === 0) return null;
    const closers = candidates.filter((m) => m.role === "Closer");
    const pool = closers.length > 0 ? closers : candidates;
    const loadByName = new Map<string, number>();
    for (const l of openLeads) {
        if (!l.assignedTo) continue;
        if (l.status === "won" || l.status === "lost") continue;
        loadByName.set(
            l.assignedTo,
            (loadByName.get(l.assignedTo) ?? 0) + 1,
        );
    }
    return [...pool].sort((a, b) => {
        const la = loadByName.get(a.name) ?? 0;
        const lb = loadByName.get(b.name) ?? 0;
        if (la !== lb) return la - lb;
        return a.name.localeCompare(b.name);
    })[0];
}
