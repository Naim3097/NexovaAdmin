/**
 * Thin AI generation wrapper.
 *
 * Two entry points:
 *  - `generateText(prompt, opts?)` — plain text in, plain text out.
 *  - `generateJSON(prompt, schema, opts?)` — text in, validated typed object out.
 *
 * Both go through Gemini by default. Adding a second provider later means
 * extending the `provider` switch here; callers don't change.
 *
 * Server-only.
 */
import "server-only";
import { z } from "zod";
import { DEFAULT_MODEL, geminiClient } from "./client";

type Provider = "gemini";

type CommonOpts = {
    /** Override the default model (e.g. for a more expensive run). */
    model?: string;
    /** Provider router — only "gemini" wired today. */
    provider?: Provider;
    /** System-style instructions prepended to the prompt. */
    system?: string;
    /** 0 = deterministic, 1 = creative. Defaults to 0.4 — facts-with-a-bit-of-style. */
    temperature?: number;
};

export async function generateText(
    prompt: string,
    opts: CommonOpts = {},
): Promise<string> {
    const model = opts.model ?? DEFAULT_MODEL;
    const client = geminiClient();

    const res = await client.models.generateContent({
        model,
        contents: opts.system
            ? `${opts.system}\n\n---\n\n${prompt}`
            : prompt,
        config: {
            temperature: opts.temperature ?? 0.4,
        },
    });

    const text = res.text ?? "";
    return text.trim();
}

/**
 * Generate JSON that matches a Zod schema. Asks Gemini for JSON output and
 * validates the result. Throws if the model returns malformed or non-matching
 * JSON (let it bubble — usually means the prompt needs tightening).
 */
export async function generateJSON<T>(
    prompt: string,
    schema: z.ZodType<T>,
    opts: CommonOpts = {},
): Promise<T> {
    const model = opts.model ?? DEFAULT_MODEL;
    const client = geminiClient();

    const res = await client.models.generateContent({
        model,
        contents: opts.system
            ? `${opts.system}\n\n---\n\n${prompt}\n\nReturn ONLY valid JSON, no prose, no markdown fences.`
            : `${prompt}\n\nReturn ONLY valid JSON, no prose, no markdown fences.`,
        config: {
            temperature: opts.temperature ?? 0.2,
            responseMimeType: "application/json",
        },
    });

    const raw = (res.text ?? "").trim();
    if (!raw) throw new Error("AI returned an empty response.");

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        throw new Error(
            `AI returned non-JSON: ${(e as Error).message}\n---\n${raw.slice(0, 500)}`,
        );
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
        throw new Error(
            `AI JSON failed schema: ${result.error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ")}`,
        );
    }
    return result.data;
}
