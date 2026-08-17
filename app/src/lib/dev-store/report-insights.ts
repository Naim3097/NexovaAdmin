/**
 * DEV-ONLY store for AI report insights, keyed by (clientName, month).
 * Replaced by Supabase `report_insights` once provisioned.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), ".dev-data");
const DIR = path.join(ROOT, "report-insights");

export type ReportInsights = {
    id: string;
    clientName: string;
    month: string;
    summary: string;
    conclusion: string;
    recommendations: string[];
    /** Visible in the client portal once the agency publishes it. */
    published: boolean;
    generatedAt: string;
};

const norm = (s: string) => s.trim().toLowerCase();

function keyFor(clientName: string, month: string) {
    return `${clientName.trim()}__${month}`.replace(/[^\w.-]+/g, "_");
}
function fileFor(clientName: string, month: string) {
    return path.join(DIR, `${keyFor(clientName, month)}.json`);
}

/** Every stored record, newest-irrelevant order. */
async function readAll(): Promise<ReportInsights[]> {
    let entries: string[];
    try {
        entries = await fs.readdir(DIR);
    } catch {
        return [];
    }
    const out: ReportInsights[] = [];
    for (const e of entries) {
        if (!e.endsWith(".json")) continue;
        try {
            const raw = await fs.readFile(path.join(DIR, e), "utf8");
            const r = JSON.parse(raw) as ReportInsights;
            out.push({ ...r, published: r.published ?? false });
        } catch {
            // skip unreadable
        }
    }
    return out;
}

export async function getReportInsights(
    clientName: string,
    month: string,
): Promise<ReportInsights | null> {
    try {
        const raw = await fs.readFile(fileFor(clientName, month), "utf8");
        const r = JSON.parse(raw) as ReportInsights;
        return { ...r, published: r.published ?? false };
    } catch {
        // Fall back to a scan — the record may be stored under a differently
        // cased/spaced spelling of the same client name (mirrors the Supabase
        // adapter's tolerant matching).
        const want = norm(clientName);
        const all = await readAll();
        return (
            all.find((r) => norm(r.clientName) === want && r.month === month) ??
            null
        );
    }
}

export async function saveReportInsights(input: {
    clientName: string;
    month: string;
    summary: string;
    conclusion: string;
    recommendations: string[];
    published?: boolean;
}): Promise<ReportInsights> {
    await fs.mkdir(DIR, { recursive: true });
    const existing = await getReportInsights(input.clientName, input.month);
    const rec: ReportInsights = {
        id: keyFor(input.clientName, input.month),
        clientName: input.clientName,
        month: input.month,
        summary: input.summary,
        conclusion: input.conclusion,
        recommendations: input.recommendations,
        published: input.published ?? existing?.published ?? false,
        generatedAt: new Date().toISOString(),
    };
    await fs.writeFile(
        fileFor(input.clientName, input.month),
        JSON.stringify(rec, null, 2),
        "utf8",
    );
    return rec;
}

export async function listPublishedReports(
    clientName: string,
): Promise<ReportInsights[]> {
    const want = norm(clientName);
    const all = await readAll();
    return all
        .filter((r) => norm(r.clientName) === want && r.published)
        .sort((a, b) => (a.month < b.month ? 1 : -1));
}

export async function setReportPublished(
    clientName: string,
    month: string,
    published: boolean,
): Promise<ReportInsights | null> {
    const existing = await getReportInsights(clientName, month);
    if (!existing) return null;
    const rec: ReportInsights = { ...existing, published };
    // Write back under the record's OWN name, not the caller's spelling, or a
    // mismatched spelling would fork a second file and the flag would appear
    // not to stick.
    await fs.writeFile(
        fileFor(rec.clientName, month),
        JSON.stringify(rec, null, 2),
        "utf8",
    );
    return rec;
}
