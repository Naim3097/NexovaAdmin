/**
 * Meta (Facebook) Lead Ads webhook receiver.
 *
 * Flow: Meta Instant Form submit → Meta POSTs a `leadgen` event here → we
 * fetch the full lead from the Graph API (the webhook only carries ids, never
 * the answers) → drop it into the same pipeline as every other lead:
 * create → score → auto-assign → audit → notify. Status starts at "new".
 *
 * Endpoints (same URL, two verbs):
 *   GET  — Meta's one-time subscription handshake: echoes `hub.challenge`
 *          when `hub.verify_token` matches META_VERIFY_TOKEN.
 *   POST — lead events. Signature-checked: `X-Hub-Signature-256` must be the
 *          HMAC-SHA256 of the RAW body keyed with META_APP_SECRET.
 *
 * Idempotent: every stored lead's notes carry a `Meta lead id: <leadgen_id>`
 * line; an event we've already stored is 200-OK'd and skipped, so Meta's
 * retries (it retries on any non-2xx) can never duplicate a lead. On a real
 * failure (Graph fetch or DB insert) we return 500 ON PURPOSE so Meta retries
 * the whole batch later.
 *
 * Env: META_APP_SECRET + META_VERIFY_TOKEN + META_PAGE_ACCESS_TOKEN
 * (see .env.example §10). Unset → endpoint answers 503 and stores nothing.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import {
    createLead,
    getLeadById,
    listLeads,
    updateLead,
} from "@/lib/data/leads";
import { listTeamMembers } from "@/lib/data/team";
import { pickAssignee, scoreLead } from "@/lib/leads/scoring";
import { recordAudit } from "@/lib/data/audit";
import { notify } from "@/lib/data/notifications";

export const dynamic = "force-dynamic";

const MARKER = (leadgenId: string) => `Meta lead id: ${leadgenId}`;

// --- GET: subscription handshake -------------------------------------------
export function GET(req: NextRequest) {
    const sp = req.nextUrl.searchParams;
    const mode = sp.get("hub.mode");
    const token = sp.get("hub.verify_token");
    const challenge = sp.get("hub.challenge");

    if (!env.META_VERIFY_TOKEN) {
        return NextResponse.json({ error: "not configured" }, { status: 503 });
    }
    if (mode === "subscribe" && token === env.META_VERIFY_TOKEN && challenge) {
        // Meta expects the raw challenge string back, not JSON.
        return new NextResponse(challenge, { status: 200 });
    }
    return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

// --- POST: leadgen events ---------------------------------------------------

function signatureOk(rawBody: string, header: string | null): boolean {
    if (!env.META_APP_SECRET || !header) return false;
    const expected =
        "sha256=" +
        createHmac("sha256", env.META_APP_SECRET).update(rawBody).digest("hex");
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

type LeadgenChange = {
    field?: string;
    value?: { leadgen_id?: string; page_id?: string; created_time?: number };
};

/** Graph API shape for GET /{leadgen_id}. Enrichment fields (campaign/adset/
 * ad names) appear only when the token can read the ad account — absence is
 * fine, the lead still lands. */
type GraphLead = {
    id: string;
    created_time?: string;
    is_organic?: boolean;
    field_data?: { name?: string; values?: string[] }[];
    campaign_name?: string;
    campaign_id?: string;
    adset_name?: string;
    adset_id?: string;
    ad_name?: string;
    ad_id?: string;
    form_id?: string;
    error?: { message?: string };
};

async function fetchGraphLead(leadgenId: string): Promise<GraphLead> {
    const version = env.META_GRAPH_VERSION || "v23.0";
    const fields = [
        "created_time",
        "is_organic",
        "field_data",
        "campaign_name",
        "campaign_id",
        "adset_name",
        "adset_id",
        "ad_name",
        "ad_id",
        "form_id",
    ].join(",");
    const url = `https://graph.facebook.com/${version}/${leadgenId}?fields=${fields}&access_token=${encodeURIComponent(env.META_PAGE_ACCESS_TOKEN ?? "")}`;
    const res = await fetch(url, { cache: "no-store" });
    const data = (await res.json()) as GraphLead;
    if (!res.ok || data.error) {
        throw new Error(
            `Graph fetch failed for lead ${leadgenId}: ${data.error?.message ?? res.status}`,
        );
    }
    return data;
}

/** Split Meta's field_data into contact fields we map + leftover Q&A. */
function mapFields(fieldData: GraphLead["field_data"]) {
    let name = "";
    let firstName = "";
    let lastName = "";
    let email = "";
    let phone = "";
    let company = "";
    const extra: { q: string; a: string }[] = [];

    for (const f of fieldData ?? []) {
        const key = (f.name ?? "").toLowerCase();
        const value = (f.values ?? []).filter(Boolean).join(", ").trim();
        if (!value) continue;
        if (key === "full_name" || key === "name") name = value;
        else if (key === "first_name") firstName = value;
        else if (key === "last_name") lastName = value;
        else if (key === "email" || key.endsWith("_email")) email = value;
        else if (key === "phone_number" || key.includes("phone")) phone = value;
        else if (key === "company_name" || key === "company") company = value;
        else extra.push({ q: f.name ?? "question", a: value });
    }
    if (!name) name = [firstName, lastName].filter(Boolean).join(" ").trim();
    return { name: name || "Meta lead", email, phone, company, extra };
}

async function storeLead(leadgenId: string): Promise<"created" | "duplicate"> {
    // Dedupe: notes carry the leadgen id marker. Linear scan is fine at our
    // lead volume, and avoids a schema migration.
    const existing = await listLeads();
    const marker = MARKER(leadgenId);
    if (existing.some((l) => l.notes.includes(marker))) return "duplicate";

    const graph = await fetchGraphLead(leadgenId);
    const { name, email, phone, company, extra } = mapFields(graph.field_data);

    const noteLines = [
        "— Meta Lead Ad —",
        marker,
        graph.campaign_name || graph.campaign_id
            ? `Campaign: ${graph.campaign_name ?? ""} ${graph.campaign_id ? `(${graph.campaign_id})` : ""}`.trim()
            : "",
        graph.adset_name || graph.adset_id
            ? `Ad set: ${graph.adset_name ?? ""} ${graph.adset_id ? `(${graph.adset_id})` : ""}`.trim()
            : "",
        graph.ad_name || graph.ad_id
            ? `Ad: ${graph.ad_name ?? ""} ${graph.ad_id ? `(${graph.ad_id})` : ""}`.trim()
            : "",
        graph.form_id ? `Form: ${graph.form_id}` : "",
        graph.is_organic ? "Organic (not from a paid ad)" : "",
        graph.created_time ? `Submitted: ${graph.created_time}` : "",
        ...extra.map(({ q, a }) => `${q}: ${a}`),
    ].filter(Boolean);

    const lead = await createLead({
        name,
        company,
        email,
        phone,
        autoIntake: true,
        source: "facebook",
        interestedIn: extra
            .map(({ a }) => a)
            .join(", ")
            .slice(0, 500),
        notes: noteLines.join("\n"),
    });

    // Score + auto-assign, same as the public intake and internal form.
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
        summary: `Lead created via Meta Lead Ad: ${lead.name}${graph.campaign_name ? ` (${graph.campaign_name})` : ""}`,
    });

    await notify({
        kind: "lead_new",
        title: `New Meta lead: ${lead.name}`,
        body:
            `Score ${breakdown.score} (${breakdown.band})` +
            (assignee ? ` · assigned to ${assignee.name}` : " · unassigned") +
            (graph.campaign_name ? ` · campaign: ${graph.campaign_name}` : ""),
        link: `/leads/${lead.id}`,
    });

    return "created";
}

export async function POST(req: NextRequest) {
    if (!env.META_APP_SECRET || !env.META_PAGE_ACCESS_TOKEN) {
        return NextResponse.json({ error: "not configured" }, { status: 503 });
    }

    // Signature is over the RAW bytes — read text first, parse after.
    const rawBody = await req.text();
    if (!signatureOk(rawBody, req.headers.get("x-hub-signature-256"))) {
        return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    let body: {
        object?: string;
        entry?: { changes?: LeadgenChange[] }[];
    };
    try {
        body = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }
    if (body.object !== "page") {
        // Subscribed to something we don't handle — acknowledge and ignore.
        return NextResponse.json({ ok: true, ignored: true });
    }

    const leadgenIds = (body.entry ?? [])
        .flatMap((e) => e.changes ?? [])
        .filter((c) => c.field === "leadgen")
        .map((c) => c.value?.leadgen_id)
        .filter((id): id is string => Boolean(id));

    let created = 0;
    let duplicates = 0;
    let failed = 0;
    for (const id of leadgenIds) {
        try {
            const outcome = await storeLead(id);
            if (outcome === "created") created += 1;
            else duplicates += 1;
        } catch (e) {
            failed += 1;
            // eslint-disable-next-line no-console
            console.error("meta-leads webhook: lead processing failed", e);
        }
    }

    // Any failure → 500 so Meta redelivers; dedupe makes the redo safe.
    if (failed > 0) {
        return NextResponse.json(
            { ok: false, created, duplicates, failed },
            { status: 500 },
        );
    }
    return NextResponse.json({ ok: true, created, duplicates });
}
