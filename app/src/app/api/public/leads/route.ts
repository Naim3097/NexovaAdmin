/**
 * Public lead intake — POST /api/public/leads
 *
 * The single public door for external sites (the Nexova Digital marketing site)
 * to drop a lead into this IMS pipeline. Mirrors what `createLeadAction` does
 * for the internal form: create → score → auto-assign → audit → notify, so a
 * web lead is indistinguishable from one entered by hand.
 *
 * Defence in depth (it's public + writes to the DB):
 *   1. Optional shared secret — if PUBLIC_LEADS_SECRET is set, callers must send
 *      it as `x-api-key` or `Authorization: Bearer <secret>`. Recommended for a
 *      server-to-server forward (the website's own backend holds the secret).
 *   2. Honeypot — a `company_website` field that real users never fill; if it's
 *      non-empty we 200-OK silently (bot thinks it succeeded, nothing is stored).
 *   3. Rate limit — per-IP token bucket (best-effort; per serverless instance).
 *
 * Response never leaks internal ids. CORS is permissive so a browser form can
 * call it directly, but the secret (when set) is what actually gates writes —
 * keep the secret server-side and forward from the website's backend.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import {
    createLead,
    getLeadById,
    listLeads,
    updateLead,
    LEAD_SOURCES,
    type LeadSource,
} from "@/lib/data/leads";
import { listTeamMembers } from "@/lib/data/team";
import { pickAssignee, scoreLead } from "@/lib/leads/scoring";
import { recordAudit } from "@/lib/data/audit";
import { notify } from "@/lib/data/notifications";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
    "Access-Control-Max-Age": "86400",
} as const;

// --- per-IP rate limit (best-effort, per serverless instance) ---------------
const RATE_LIMIT = 5; // requests
const RATE_WINDOW_MS = 60_000; // per minute
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    recent.push(now);
    hits.set(ip, recent);
    return recent.length > RATE_LIMIT;
}

function clientIp(req: NextRequest): string {
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]!.trim();
    return req.headers.get("x-real-ip") ?? "unknown";
}

function secretOk(req: NextRequest): boolean {
    const expected = env.PUBLIC_LEADS_SECRET;
    if (!expected) return true; // not configured → secret check disabled
    const apiKey = req.headers.get("x-api-key");
    if (apiKey && apiKey === expected) return true;
    const auth = req.headers.get("authorization");
    if (auth && auth.replace(/^Bearer\s+/i, "") === expected) return true;
    return false;
}

const BodySchema = z.object({
    name: z.string().trim().min(1, "name is required").max(200),
    company: z.string().trim().max(200).optional().default(""),
    email: z.string().trim().email().max(200).optional().or(z.literal("")).default(""),
    phone: z.string().trim().max(50).optional().default(""),
    // free text — what the prospect is interested in (or their message)
    interestedIn: z.string().trim().max(2000).optional().default(""),
    message: z.string().trim().max(2000).optional(),
    source: z.string().trim().optional(),
    estValueMyr: z.coerce.number().nonnegative().optional().default(0),
    // honeypot — must stay empty
    company_website: z.string().optional(),
});

function asSource(v: string | undefined): LeadSource {
    return (LEAD_SOURCES as readonly string[]).includes(v ?? "")
        ? (v as LeadSource)
        : "website";
}

export function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
    if (!secretOk(req)) {
        return NextResponse.json(
            { ok: false, error: "unauthorized" },
            { status: 401, headers: CORS_HEADERS },
        );
    }

    if (rateLimited(clientIp(req))) {
        return NextResponse.json(
            { ok: false, error: "rate limited" },
            { status: 429, headers: CORS_HEADERS },
        );
    }

    let raw: unknown;
    try {
        raw = await req.json();
    } catch {
        return NextResponse.json(
            { ok: false, error: "invalid JSON" },
            { status: 400, headers: CORS_HEADERS },
        );
    }

    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
        return NextResponse.json(
            { ok: false, error: "validation failed", issues: parsed.error.issues },
            { status: 422, headers: CORS_HEADERS },
        );
    }
    const input = parsed.data;

    // Honeypot tripped → pretend success, store nothing.
    if (input.company_website && input.company_website.trim().length > 0) {
        return NextResponse.json({ ok: true }, { status: 201, headers: CORS_HEADERS });
    }

    const interestedIn = input.interestedIn || input.message || "";

    try {
        const lead = await createLead({
            name: input.name,
            company: input.company,
            email: input.email,
            phone: input.phone,
            source: asSource(input.source),
            interestedIn,
            estValueMyr: input.estValueMyr,
            notes: input.message && input.message !== interestedIn ? input.message : "",
        });

        // Score + auto-assign, same as the internal createLeadAction flow.
        const [allLeads, team] = await Promise.all([listLeads(), listTeamMembers()]);
        const fresh = (await getLeadById(lead.id)) ?? lead;
        const breakdown = scoreLead(fresh);
        const assignee = pickAssignee(team, allLeads);
        await updateLead(lead.id, {
            score: breakdown.score,
            assignedTo: assignee?.name ?? "",
        });

        await recordAudit({
            entity: "lead",
            entityId: lead.id,
            kind: "create",
            summary: `Lead created via public form: ${lead.name}${lead.company ? ` (${lead.company})` : ""}`,
        });

        await notify({
            kind: "lead_new",
            title: `New website lead: ${lead.name}${lead.company ? ` (${lead.company})` : ""}`,
            body:
                `Score ${breakdown.score} (${breakdown.band})` +
                (assignee ? ` · assigned to ${assignee.name}` : " · unassigned") +
                (interestedIn ? ` · interested in: ${interestedIn}` : ""),
            link: `/leads/${lead.id}`,
        });

        return NextResponse.json({ ok: true }, { status: 201, headers: CORS_HEADERS });
    } catch (e) {
        console.error("public lead intake failed", e);
        return NextResponse.json(
            { ok: false, error: "could not record lead" },
            { status: 500, headers: CORS_HEADERS },
        );
    }
}
