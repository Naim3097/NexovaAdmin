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
        return JSON.parse(raw) as ReportInsights;
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
}): Promise<ReportInsights> {
    await fs.mkdir(DIR, { recursive: true });
    const rec: ReportInsights = {
        id: keyFor(input.clientName, input.month),
        clientName: input.clientName,
        month: input.month,
        summary: input.summary,
        conclusion: input.conclusion,
        recommendations: input.recommendations,
        generatedAt: new Date().toISOString(),
    };
    await fs.writeFile(
        fileFor(input.clientName, input.month),
        JSON.stringify(rec, null, 2),
        "utf8",
    );
    return rec;
}
