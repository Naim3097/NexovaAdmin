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

    CALCOM_WEBHOOK_SECRET: z.string().optional(),

    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
    TURNSTILE_SECRET_KEY: z.string().optional(),

    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

const parsed = ServerEnvSchema.safeParse(process.env);

if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("❌ Invalid environment variables:", z.treeifyError(parsed.error));
    throw new Error("Invalid environment configuration. See .env.example.");
}

export const env: ServerEnv = parsed.data;

/** Public env values safe to ship to the browser. */
export const publicEnv = {
    siteUrl: env.NEXT_PUBLIC_SITE_URL,
    siteName: env.NEXT_PUBLIC_SITE_NAME,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    turnstileSiteKey: env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    posthogKey: env.NEXT_PUBLIC_POSTHOG_KEY,
    posthogHost: env.NEXT_PUBLIC_POSTHOG_HOST,
    sentryDsn: env.NEXT_PUBLIC_SENTRY_DSN,
};
