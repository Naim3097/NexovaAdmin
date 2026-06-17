/**
 * Write a client-facing monthly report narrative — Summary, Conclusion, and
 * Recommendations — from that month's deliverables + review notes + ad metrics.
 *
 * Server-only. Goes through generateJSON so the output is always validated.
 */
import "server-only";
import { z } from "zod";
import { generateJSON } from "./generate";

export const ReportInsightsSchema = z.object({
    summary: z
        .string()
        .min(40)
        .max(2200)
        .describe("3-6 sentences recapping what was delivered this month."),
    conclusion: z
        .string()
        .min(20)
        .max(1500)
        .describe("2-4 sentences on the outcome / how the month went."),
    recommendations: z
        .array(z.string().min(5).max(300))
        .min(2)
        .max(6)
        .describe("Concrete next-month suggestions."),
});

export type ReportInsightsResult = z.infer<typeof ReportInsightsSchema>;

export type ReportInsightsInput = {
    clientName: string;
    month: string; // YYYY-MM
    packageName: string;
    delivered: {
        title: string;
        platform: string;
        type: string;
        caption: string;
        direction: string;
        notes: string[]; // client feedback during review
    }[];
    campaigns: {
        name: string;
        platform: string;
        spendMyr: number;
        impressions: number;
        clicks: number;
        leads: number;
    }[];
    extras: { contentCount: number; revisionCount: number };
};

export async function generateReportInsights(
    input: ReportInsightsInput,
): Promise<ReportInsightsResult> {
    const system = [
        "You are an account manager at Nexova, a Malaysian digital agency,",
        "writing the narrative for a client's monthly report. Audience: the client.",
        "Tone: warm, confident, concrete, no fluff or jargon. Currency is MYR.",
        "Base everything ONLY on the data provided — never invent metrics.",
    ].join(" ");

    const digest = {
        client: input.clientName,
        month: input.month,
        package: input.packageName,
        deliveredCount: input.delivered.length,
        delivered: input.delivered,
        adCampaigns: input.campaigns,
        chargeableExtras: input.extras,
    };

    const prompt = [
        `Here is everything that happened for this client this month (JSON):`,
        JSON.stringify(digest, null, 2),
        ``,
        `Write, grounded only in the above:`,
        `1. summary — 3-6 sentences recapping what was delivered (the content, themes, any ad results).`,
        `2. conclusion — 2-4 sentences on how the month went overall.`,
        `3. recommendations — 2-6 specific, actionable suggestions for next month`,
        `   (e.g. content angles, cadence, what to double down on). Use the review`,
        `   notes and what was delivered to inform these.`,
    ].join("\n");

    return generateJSON(prompt, ReportInsightsSchema, {
        system,
        temperature: 0.5,
    });
}
