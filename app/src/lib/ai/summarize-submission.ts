/**
 * Summarise a submitted onboarding form into:
 *  - a 1-paragraph brief the team can skim
 *  - 3-7 suggested tasks (each with a clear title + which skill it needs)
 *
 * Used after the client clicks Submit on the onboarding form. The output is
 * shown to the team for human review before tasks land in projects.
 *
 * Server-only. Goes through `generateJSON` so the result is always validated.
 */
import "server-only";
import { z } from "zod";
import { generateJSON } from "./generate";

const TaskSchema = z.object({
    title: z.string().min(3).max(120),
    description: z.string().min(0).max(400).optional().default(""),
    skill: z.enum([
        "design",
        "frontend",
        "backend",
        "content",
        "ads",
        "seo",
        "pm",
        "other",
    ]),
});

export const SummarySchema = z.object({
    brief: z
        .string()
        .min(40)
        .max(2000)
        .describe("One-paragraph brief, 3-5 sentences, plain English."),
    tasks: z.array(TaskSchema).min(1).max(10),
});

export type OnboardingSummary = z.infer<typeof SummarySchema>;

export type SummariseInput = {
    clientName: string;
    serviceType: string; // e.g. "Website Creation"
    submission: Record<string, unknown>;
};

export async function summariseOnboardingSubmission(
    input: SummariseInput,
): Promise<OnboardingSummary> {
    const { clientName, serviceType, submission } = input;

    const submissionJson = JSON.stringify(submission, null, 2);

    const system = [
        "You are a project lead at Nexova, a Malaysian digital agency.",
        "You read raw client onboarding data and turn it into a tight brief plus a punch list of tasks the team can execute on.",
        "Tone: clear, practical, no jargon. Currency is MYR.",
        "When suggesting tasks, name the skill needed (design / frontend / backend / content / ads / seo / pm / other).",
    ].join(" ");

    const prompt = [
        `Service: ${serviceType}`,
        `Client: ${clientName}`,
        ``,
        `Raw onboarding submission (JSON):`,
        submissionJson,
        ``,
        `Produce:`,
        `1. A 3-5 sentence brief summarising what this client wants, who they are, and the main risks or unknowns.`,
        `2. 3-7 concrete tasks to start executing. Each task: short imperative title, one-line description, and the skill needed.`,
    ].join("\n");

    return generateJSON(prompt, SummarySchema, { system, temperature: 0.3 });
}
