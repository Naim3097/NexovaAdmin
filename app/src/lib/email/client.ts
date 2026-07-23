/**
 * Resend client (lazy-init).
 *
 * Server-only. Provider is Resend today; if we ever swap (SES, Postmark, etc.)
 * this is the only file that imports the SDK — `send.ts` stays the API surface
 * the rest of the app uses.
 */
import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";

let _resend: Resend | null = null;

export function resendClient(): Resend {
    if (!_resend) {
        if (!env.RESEND_API_KEY) {
            throw new Error(
                "RESEND_API_KEY is not set. Add it to .env.local — see docs/pending-production-setup.md.",
            );
        }
        _resend = new Resend(env.RESEND_API_KEY);
    }
    return _resend;
}

/**
 * Default `from` address. Test mode uses `onboarding@resend.dev` (no DNS).
 * Production: set RESEND_FROM in env to `Nexova <noreply@nexops.my>` once the
 * nexops.my domain is verified in Resend — see docs/pending-production-setup.md.
 */
export function defaultFromAddress(): string {
    return env.RESEND_FROM ?? "Nexov <onboarding@resend.dev>";
}
