/**
 * Centralised environment variable access with Zod validation.
 * Server-only keys are not exposed to the client bundle.
 */
import { z } from "zod";

const ServerEnvSchema = z.object({
    NEXT_PUBLIC_SITE_URL: z.string().url(),
    NEXT_PUBLIC_SITE_NAME: z.string().default("Nexova Admin"),

    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

    /**
     * Per-entity feature flag for the Supabase cutover.
     *
     * - "0" / unset → all reads/writes go to the local .dev-data/ JSON store.
     * - "1"          → ALL entities go to Supabase.
     * - Comma list   → only the listed entities go to Supabase, e.g.
     *                  `USE_SUPABASE=leads,projects`.
     *
     * The flag is read at request time (not module load) so flipping it
     * doesn't require a rebuild.
     */
    USE_SUPABASE: z.string().default("0"),

    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM: z.string().optional(),

    // ---- LeanX (Malaysian FPX payment links) -----------------------------
    // Sandbox: https://api.leanx.dev   ·   Production: https://api.leanx.io
    LEANX_API_BASE: z.string().url().default("https://api.leanx.dev"),
    LEANX_AUTH_TOKEN: z.string().optional(),       // header value: LP-<MERCHANT>-MM|<UUID>|<TOKEN>
    LEANX_COLLECTION_UUID: z.string().optional(),  // which "collection" bills land in
    LEANX_HASH_KEY: z.string().optional(),         // HMAC-SHA256 secret for webhook JWT verify

    ANTHROPIC_API_KEY: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),

    N8N_WEBHOOK_BASE: z.string().url().optional(),
    N8N_INBOUND_SECRET: z.string().optional(),

    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_TEAM_CHAT_ID: z.string().optional(),

    /**
     * Auth for the external agent API (`/api/agent`). See lib/agent/scopes.ts.
     * Two ways to configure keys (both optional; unset → endpoint locked):
     *
     *  - AGENT_API_KEYS: JSON array of scoped keys, e.g.
     *      [{"label":"scrum","key":"<32+ chars>","scopes":["read","write","outbound"]}]
     *    Preferred. Scopes: read | write | outbound | destructive. The scrum
     *    master gets read+write+outbound (full operational power) but NOT
     *    destructive — deletions require a human-held admin key.
     *
     *  - AGENT_API_KEY (+ AGENT_API_SCOPES): a single key whose scopes come
     *    from AGENT_API_SCOPES (comma list of read|write|outbound). Defaults to
     *    "read" (least privilege) when AGENT_API_SCOPES is unset.
     *
     * Keys shorter than 24 chars are rejected (low entropy). Validation is done
     * in scopes.ts (fail-closed) so a bad value locks the endpoint, not the app.
     */
    AGENT_API_KEYS: z.string().optional(),
    AGENT_API_KEY: z.string().optional(),
    AGENT_API_SCOPES: z.string().optional(),
    /** Comma list of tools the single key may NOT call (e.g. "email.*"). */
    AGENT_API_DENY: z.string().optional(),
    /**
     * Set to "1" only when the app sits behind a trusted proxy/LB that rewrites
     * `x-forwarded-for`. Then the agent API's brute-force throttle keys on the
     * client IP; otherwise it uses a single global bucket (un-spoofable).
     */
    AGENT_TRUST_PROXY: z.string().optional(),

    CALCOM_WEBHOOK_SECRET: z.string().optional(),

    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
    TURNSTILE_SECRET_KEY: z.string().optional(),

    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

function loadServerEnv(): ServerEnv {
    const parsed = ServerEnvSchema.safeParse(process.env);
    if (!parsed.success) {
        // eslint-disable-next-line no-console
        console.error(
            "❌ Invalid environment variables:",
            z.treeifyError(parsed.error),
        );
        throw new Error("Invalid environment configuration. See .env.example.");
    }
    return parsed.data;
}

/**
 * Server-validated environment. ONLY parsed on the server — on the client
 * `process.env` is not a full object (Next.js only inlines individual
 * `NEXT_PUBLIC_*` reads it sees in source), so parsing it would always fail and
 * throw. Client code must use `publicEnv` below, never `env`.
 */
export const env: ServerEnv =
    typeof window === "undefined"
        ? loadServerEnv()
        : (undefined as unknown as ServerEnv);

/**
 * Public values safe for the browser. Each `NEXT_PUBLIC_*` is read directly so
 * the bundler inlines it on the client. Do NOT derive these from `env` (which
 * is undefined in the browser).
 */
export const publicEnv = {
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001",
    siteName: process.env.NEXT_PUBLIC_SITE_NAME ?? "Nexova Admin",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
};
