/**
 * AI provider clients.
 *
 * Gemini is the default workhorse for Nexov Admin (free-tier friendly, fast).
 * Claude / others can be added here as additional named exports; callers pick
 * via `src/lib/ai/generate.ts` which routes by provider name.
 *
 * Server-only. Never import from a client component.
 */
import "server-only";
import { GoogleGenAI } from "@google/genai";
import { env } from "@/lib/env";

let _gemini: GoogleGenAI | null = null;

/**
 * Lazily-initialised Gemini client. Throws a clear error if the key is missing
 * so the failure shows up at request time, not at module load.
 */
export function geminiClient(): GoogleGenAI {
    if (!_gemini) {
        if (!env.GEMINI_API_KEY) {
            throw new Error(
                "GEMINI_API_KEY is not set. Add it to .env.local — see docs/supabase-setup.md.",
            );
        }
        _gemini = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    }
    return _gemini;
}

/** Default model — fast, cheap, supports structured output. */
export const DEFAULT_MODEL = "gemini-2.5-flash";
