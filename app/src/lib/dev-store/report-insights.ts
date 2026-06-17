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

function keyFor(clientName: string, month: string) {
    return `${clientName}__${month}`.replace(/[^\w.-]+/g, "_");
}
function fileFor(clientName: string, month: string) {
    return path.join(DIR, `${keyFor(clientName, month)}.json`);
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
        return null;
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
            if (r.clientName === clientName && r.published) out.push(r);
        } catch {
            // skip
        }
    }
    return out.sort((a, b) => (a.month < b.month ? 1 : -1));
}

export async function setReportPublished(
    clientName: string,
    month: string,
    published: boolean,
): Promise<ReportInsights | null> {
    const existing = await getReportInsights(clientName, month);
    if (!existing) return null;
    const rec: ReportInsights = { ...existing, published };
    await fs.writeFile(
        fileFor(clientName, month),
        JSON.stringify(rec, null, 2),
        "utf8",
    );
    return rec;
}
